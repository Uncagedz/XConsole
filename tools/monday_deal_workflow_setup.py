from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib import error, request


API_URL = "https://api.monday.com/v2"
DEFAULT_API_VERSION = "2026-01"
DEFAULT_BOARD_NAME = "Deal Workflow \u2013 Sales to Finance"
DEAL_NAME_COLUMN_DESCRIPTION = "Use the format Deal # [deal_number] \u2013 [customer_last_name]."
ROOT = Path(__file__).resolve().parents[1]


class MondayApiError(RuntimeError):
    """Raised when the monday.com API returns an error."""


class GQLEnum(str):
    """Marks a value so it renders as a GraphQL enum instead of a string."""


@dataclass(frozen=True)
class GroupSpec:
    key: str
    title: str
    color: str | None = None


@dataclass(frozen=True)
class StatusLabelSpec:
    label: str
    color: str
    is_done: bool = False


@dataclass(frozen=True)
class ColumnSpec:
    key: str
    title: str
    kind: str
    description: str
    labels: tuple[StatusLabelSpec, ...] = ()
    optional: bool = False


@dataclass(frozen=True)
class SampleDeal:
    name: str
    group_key: str
    values: dict[str, Any]
    update_body: str


GROUP_SPECS = [
    GroupSpec("sales_desk", "Sales Desk"),
    GroupSpec("finance_review", "Finance Review", "#579bfc"),
    GroupSpec("completed_funded", "Completed / Funded", "#00c875"),
    GroupSpec("exceptions", "Exceptions / Missing Info", "#e2445c"),
]

SALES_CHECKLIST_TITLES = [
    "Quick Scan Completed",
    "Insurance Verified",
    "Trade Appraisal Completed",
    "ACV Trade Entered",
    "Title Created",
    "Down Payment Verified",
    "COD Verified",
    "Quick Scan Exception Reviewed",
    "Lease Payoff Added",
    "Vehicle Buyout Added",
    "Customer Docs Uploaded",
    "Driver License Collected",
    "Buyer Info Confirmed",
    "Co-Buyer Info Confirmed",
    "Deal Jacket Complete",
]

FINANCE_CHECKLIST_TITLES = [
    "Verify Quick Scan",
    "Verify Insurance",
    "Verify Trade Payoff",
    "Verify Taxes Accurate",
    "Verify Driver License Name Matches Deal",
    "Verify Customer Info Matches Contract",
    "Verify Down Payment Received",
    "Verify Stips Collected",
    "Verify Lender Packet Complete",
    "Verify Title / Registration Info",
    "Verify Contract Accuracy",
    "Verify Menu / Backend Products",
    "Verify Cashiers Receipt or Proof of Funds",
    "Verify Funding Package Sent",
    "Final Funding Review",
]

CHECKLIST_LABELS = (
    StatusLabelSpec("Incomplete", "working_orange"),
    StatusLabelSpec("Complete", "done_green", is_done=True),
)

MANUAL_AUTOMATIONS = [
    {
        "id": 1,
        "recipe": "When an item is created, set Created Date to today.",
        "why_manual": "The public monday.com platform API can create the Date column, but native board automations are still configured in the Automation Center, not through a one-off API mutation.",
    },
    {
        "id": 2,
        "recipe": "When Sales Ready changes to Complete, move the item to Finance Review and optionally set Sales Stage to Sent to Finance.",
        "why_manual": "This is a native board automation recipe and should be added in monday after the board exists.",
    },
    {
        "id": 3,
        "recipe": "When an item moves to Finance Review and Finance Manager is empty, notify a fixed Finance Director / Owner.",
        "why_manual": "This needs a UI automation because the public API does not expose native automation creation. If you want dynamic routing, add an optional Escalation Owner people column manually.",
    },
    {
        "id": 4,
        "recipe": "When Finance Verified changes to Complete, set Finance Stage to Verified.",
        "why_manual": "Native monday automation recipe; add manually in the Automation Center.",
    },
    {
        "id": 5,
        "recipe": "When Funding Status changes to Funded, move the item to Completed / Funded and set Sales Stage and Finance Stage to Funded.",
        "why_manual": "Native monday automation recipe; add manually in the Automation Center.",
    },
    {
        "id": 6,
        "recipe": "If any required sales checklist field is still incomplete when Sales Ready is set to Complete, move the item to Exceptions / Missing Info or set Sales Stage to Exception.",
        "why_manual": "This is the hardest rule to do natively. The closest practical options are monday workflow builder logic, required fields, or conditional status changes in monday CRM Ultimate. A basic CSV import and this script cannot enforce this rule by themselves.",
    },
    {
        "id": 7,
        "recipe": "When Finance Stage changes to Exception, notify Sales Manager and move the item to Exceptions / Missing Info.",
        "why_manual": "Native monday automation recipe; add manually in the Automation Center.",
    },
    {
        "id": 8,
        "recipe": "Use item updates and @mentions for every handoff, funding issue, missing stip, corrected doc, and exception resolution.",
        "why_manual": "Updates are part of the item audit trail, but the operating habit still has to be implemented by your team.",
    },
]

MANUAL_LIMITATIONS = [
    "The public monday.com platform API can create the board, groups, columns, items, and sample updates, but it does not expose a simple mutation to create native board automations from this script.",
    "CSV / Excel import cannot create the four target groups in the right places, cannot place new rows directly into those existing groups, and cannot import data into the Updates section.",
    "Import supports text, date, number, email, and status style mapping best. People columns, last updated columns, and role-based field restrictions still need board setup work after import.",
    "A true rule like 'Sales Managers can edit sales fields, but only GSM / Director can override them later' is not fully enforceable through import or a lightweight API bootstrap. The closest practical setup is column permissions, board ownership, and activity / update audit trails configured manually.",
]


def log(message: str) -> None:
    print(message, file=sys.stderr)


def gql_value(value: Any) -> str:
    if isinstance(value, GQLEnum):
        return str(value)
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "[" + ", ".join(gql_value(item) for item in value) + "]"
    if isinstance(value, tuple):
        return "[" + ", ".join(gql_value(item) for item in value) + "]"
    if isinstance(value, dict):
        fields = [f"{key}: {gql_value(item)}" for key, item in value.items() if item is not None]
        return "{ " + ", ".join(fields) + " }"
    raise TypeError(f"Unsupported GraphQL value: {type(value)!r}")


def gql_args(arguments: dict[str, Any]) -> str:
    return ", ".join(f"{key}: {gql_value(value)}" for key, value in arguments.items() if value is not None)


def checklist_key(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return slug


def build_column_specs() -> list[ColumnSpec]:
    specs: list[ColumnSpec] = [
        ColumnSpec("created_date", "Created Date", "date", "Operational intake date for the deal."),
        ColumnSpec("deal_number", "Deal Number", "text", "DMS or internal desk deal number."),
        ColumnSpec("stock_number", "Stock Number", "text", "Inventory stock number."),
        ColumnSpec("vin", "VIN", "text", "Full vehicle identification number."),
        ColumnSpec("customer_name", "Customer Name", "text", "Primary buyer or customer name."),
        ColumnSpec("sales_manager", "Sales Manager", "people", "Primary sales manager responsible for the desked deal."),
        ColumnSpec("salesperson", "Salesperson", "people", "Primary salesperson or closer on the deal."),
        ColumnSpec("finance_manager", "Finance Manager", "people", "Assigned finance manager handling funding and verification."),
        ColumnSpec(
            "deal_type",
            "Deal Type",
            "status",
            "Primary deal structure.",
            (
                StatusLabelSpec("Cash", "bright_blue"),
                StatusLabelSpec("Finance", "working_orange"),
                StatusLabelSpec("Lease", "dark_blue"),
            ),
        ),
        ColumnSpec(
            "vehicle_type",
            "Vehicle Type",
            "status",
            "Inventory type for the unit sold.",
            (
                StatusLabelSpec("New", "sky"),
                StatusLabelSpec("Used", "purple"),
            ),
        ),
        ColumnSpec(
            "trade_in",
            "Trade-In",
            "status",
            "Whether the customer is trading a vehicle.",
            (
                StatusLabelSpec("Yes", "working_orange"),
                StatusLabelSpec("No", "done_green"),
            ),
        ),
        ColumnSpec(
            "sales_stage",
            "Sales Stage",
            "status",
            "High-level sales desk workflow stage.",
            (
                StatusLabelSpec("Working", "sky"),
                StatusLabelSpec("Pending Docs", "working_orange"),
                StatusLabelSpec("Sales Ready", "bright_blue"),
                StatusLabelSpec("Sent to Finance", "purple"),
                StatusLabelSpec("Finance Review", "dark_blue"),
                StatusLabelSpec("Ready to Fund", "teal"),
                StatusLabelSpec("Funded", "done_green", is_done=True),
                StatusLabelSpec("Exception", "stuck_red"),
            ),
        ),
        ColumnSpec(
            "finance_stage",
            "Finance Stage",
            "status",
            "High-level finance workflow stage.",
            (
                StatusLabelSpec("Not Started", "american_gray"),
                StatusLabelSpec("In Review", "bright_blue"),
                StatusLabelSpec("Waiting on Customer", "working_orange"),
                StatusLabelSpec("Waiting on Bank", "purple"),
                StatusLabelSpec("Verified", "teal"),
                StatusLabelSpec("Ready to Fund", "dark_blue"),
                StatusLabelSpec("Funded", "done_green", is_done=True),
                StatusLabelSpec("Exception", "stuck_red"),
            ),
        ),
        ColumnSpec(
            "sales_ready",
            "Sales Ready",
            "status",
            "Desk packet completion gate for handoff to finance.",
            (
                StatusLabelSpec("Not Ready", "working_orange"),
                StatusLabelSpec("Complete", "done_green", is_done=True),
            ),
        ),
        ColumnSpec(
            "finance_verified",
            "Finance Verified",
            "status",
            "Finance verification gate for funding readiness.",
            (
                StatusLabelSpec("Not Verified", "working_orange"),
                StatusLabelSpec("Complete", "done_green", is_done=True),
            ),
        ),
        ColumnSpec(
            "funding_status",
            "Funding Status",
            "status",
            "Funding submission lifecycle.",
            (
                StatusLabelSpec("Not Submitted", "american_gray"),
                StatusLabelSpec("Submitted", "bright_blue"),
                StatusLabelSpec("Funded", "done_green", is_done=True),
            ),
        ),
        ColumnSpec("notes", "Notes", "long_text", "Operational notes for the deal handoff or current blocker."),
        ColumnSpec("last_updated", "Last Updated", "last_updated", "Read-only last updated log column from monday.", optional=True),
        ColumnSpec("exception_reason", "Exception Reason", "long_text", "Detailed reason the deal is blocked, kicked back, or missing info."),
    ]

    for title in SALES_CHECKLIST_TITLES:
        specs.append(
            ColumnSpec(
                checklist_key(title),
                title,
                "status",
                "Sales-side checklist field. Mark Complete when verified.",
                CHECKLIST_LABELS,
            )
        )

    for title in FINANCE_CHECKLIST_TITLES:
        specs.append(
            ColumnSpec(
                checklist_key(title),
                title,
                "status",
                "Finance-side checklist field. Mark Complete when verified.",
                CHECKLIST_LABELS,
            )
        )

    return specs


COLUMN_SPECS = build_column_specs()


def build_sample_deals(today: date) -> list[SampleDeal]:
    sales_all_complete = {checklist_key(title): "Complete" for title in SALES_CHECKLIST_TITLES}
    finance_all_incomplete = {checklist_key(title): "Incomplete" for title in FINANCE_CHECKLIST_TITLES}
    finance_core_started = finance_all_incomplete | {
        checklist_key("Verify Quick Scan"): "Complete",
        checklist_key("Verify Insurance"): "Complete",
        checklist_key("Verify Down Payment Received"): "Complete",
        checklist_key("Verify Customer Info Matches Contract"): "Complete",
        checklist_key("Verify Driver License Name Matches Deal"): "Complete",
    }
    finance_all_complete = {checklist_key(title): "Complete" for title in FINANCE_CHECKLIST_TITLES}

    return [
        SampleDeal(
            name="Deal # 100245 \u2013 Carter",
            group_key="sales_desk",
            values={
                "created_date": today.isoformat(),
                "deal_number": "100245",
                "stock_number": "U42187",
                "vin": "1C4RJFBG8PC123456",
                "customer_name": "Jordan Carter",
                "deal_type": "Finance",
                "vehicle_type": "Used",
                "trade_in": "Yes",
                "sales_stage": "Working",
                "finance_stage": "Not Started",
                "sales_ready": "Not Ready",
                "finance_verified": "Not Verified",
                "funding_status": "Not Submitted",
                "notes": "Waiting on insurance card and final trade payoff before handoff to finance.",
                "exception_reason": "",
                checklist_key("Quick Scan Completed"): "Complete",
                checklist_key("Insurance Verified"): "Incomplete",
                checklist_key("Trade Appraisal Completed"): "Complete",
                checklist_key("ACV Trade Entered"): "Complete",
                checklist_key("Title Created"): "Complete",
                checklist_key("Down Payment Verified"): "Complete",
                checklist_key("COD Verified"): "Complete",
                checklist_key("Quick Scan Exception Reviewed"): "Incomplete",
                checklist_key("Lease Payoff Added"): "Incomplete",
                checklist_key("Vehicle Buyout Added"): "Incomplete",
                checklist_key("Customer Docs Uploaded"): "Incomplete",
                checklist_key("Driver License Collected"): "Complete",
                checklist_key("Buyer Info Confirmed"): "Complete",
                checklist_key("Co-Buyer Info Confirmed"): "Incomplete",
                checklist_key("Deal Jacket Complete"): "Incomplete",
                **finance_all_incomplete,
            },
            update_body="Bootstrap note: Use Updates to record missing docs, payoff questions, and the exact handoff notes for this deal.",
        ),
        SampleDeal(
            name="Deal # 100246 \u2013 Morales",
            group_key="finance_review",
            values={
                "created_date": today.isoformat(),
                "deal_number": "100246",
                "stock_number": "N31804",
                "vin": "3GNKDBRJ8RS654321",
                "customer_name": "Elena Morales",
                "deal_type": "Lease",
                "vehicle_type": "New",
                "trade_in": "No",
                "sales_stage": "Sent to Finance",
                "finance_stage": "In Review",
                "sales_ready": "Complete",
                "finance_verified": "Not Verified",
                "funding_status": "Not Submitted",
                "notes": "Desk packet sent to finance. Waiting on lender stip confirmation and menu review.",
                "exception_reason": "",
                **sales_all_complete,
                **finance_core_started,
            },
            update_body="Finance handoff sample: capture bank stip requests, lender callbacks, and any desk corrections in Updates with timestamps.",
        ),
        SampleDeal(
            name="Deal # 100247 \u2013 Nguyen",
            group_key="completed_funded",
            values={
                "created_date": today.isoformat(),
                "deal_number": "100247",
                "stock_number": "U42791",
                "vin": "5XYRLDLC9RG765432",
                "customer_name": "Lena Nguyen",
                "deal_type": "Finance",
                "vehicle_type": "Used",
                "trade_in": "No",
                "sales_stage": "Funded",
                "finance_stage": "Funded",
                "sales_ready": "Complete",
                "finance_verified": "Complete",
                "funding_status": "Funded",
                "notes": "Funded and booked. Use this sample item to validate final-state filters and reporting.",
                "exception_reason": "",
                **sales_all_complete,
                **finance_all_complete,
            },
            update_body="Funding sample: record sent-to-bank timestamps, funding confirmation, and any corrected-package notes in Updates for the audit trail.",
        ),
    ]


class MondayClient:
    def __init__(self, token: str, api_version: str = DEFAULT_API_VERSION, api_url: str = API_URL) -> None:
        self.token = token
        self.api_version = api_version
        self.api_url = api_url

    def execute(self, query: str, *, operation: str) -> dict[str, Any]:
        last_error: Exception | None = None

        for attempt, delay_seconds in enumerate((0, 1, 2, 4), start=1):
            if delay_seconds:
                time.sleep(delay_seconds)

            payload = json.dumps({"query": query}).encode("utf-8")
            req = request.Request(
                self.api_url,
                data=payload,
                headers={
                    "Authorization": self.token,
                    "API-Version": self.api_version,
                    "Content-Type": "application/json",
                },
                method="POST",
            )

            try:
                with request.urlopen(req, timeout=90) as response:
                    body = response.read().decode("utf-8")
            except error.HTTPError as exc:
                raw_error = exc.read().decode("utf-8", errors="replace")
                last_error = MondayApiError(f"{operation} failed with HTTP {exc.code}: {raw_error}")
                if exc.code in {429, 500, 502, 503, 504} and attempt < 4:
                    continue
                raise last_error from exc
            except error.URLError as exc:
                last_error = MondayApiError(f"{operation} failed to reach monday.com: {exc.reason}")
                if attempt < 4:
                    continue
                raise last_error from exc

            try:
                parsed = json.loads(body)
            except json.JSONDecodeError as exc:
                raise MondayApiError(f"{operation} returned non-JSON output: {body[:500]}") from exc

            errors = parsed.get("errors") or []
            if errors:
                messages = []
                transient = False
                for item in errors:
                    message = item.get("message", "Unknown monday.com GraphQL error")
                    messages.append(message)
                    lowered = message.lower()
                    if "locked" in lowered or "timeout" in lowered or "try again" in lowered:
                        transient = True
                request_id = parsed.get("extensions", {}).get("request_id")
                detail = "; ".join(messages)
                suffix = f" [request_id={request_id}]" if request_id else ""
                last_error = MondayApiError(f"{operation} failed: {detail}{suffix}")
                if transient and attempt < 4:
                    continue
                raise last_error

            data = parsed.get("data")
            if data is None:
                raise MondayApiError(f"{operation} returned no data.")

            return data

        if last_error is None:
            raise MondayApiError(f"{operation} failed for an unknown reason.")
        raise last_error


def build_status_settings(labels: tuple[StatusLabelSpec, ...]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for index, label in enumerate(labels, start=1):
        item: dict[str, Any] = {
            "index": index,
            "label": label.label,
            "color": GQLEnum(label.color),
        }
        if label.is_done:
            item["is_done"] = True
        items.append(item)
    return {"labels": items}


def build_column_value(spec: ColumnSpec, raw_value: Any) -> Any:
    if raw_value in (None, ""):
        return None
    if spec.kind == "date":
        return {"date": str(raw_value)}
    if spec.kind == "status":
        return {"label": str(raw_value)}
    if spec.kind == "long_text":
        return {"text": str(raw_value)}
    return str(raw_value)


def resolve_workspace_id(client: MondayClient, explicit_workspace_id: str | None) -> str | None:
    if explicit_workspace_id:
        return explicit_workspace_id

    try:
        data = client.execute(
            """
            query {
              workspaces {
                id
                name
                is_default_workspace
              }
            }
            """,
            operation="resolve_workspace_id",
        )
    except MondayApiError as exc:
        log(f"Warning: could not query workspaces automatically. Proceeding without workspace_id. Details: {exc}")
        return None

    workspaces = data.get("workspaces") or []
    if not workspaces:
        return None

    default_workspace = next((workspace for workspace in workspaces if workspace.get("is_default_workspace")), None)
    chosen = default_workspace or workspaces[0]
    chosen_id = str(chosen["id"])
    log(f"Resolved workspace '{chosen.get('name', chosen_id)}' ({chosen_id}).")
    return chosen_id


def create_board(client: MondayClient, board_name: str, board_kind: str, workspace_id: str | None) -> dict[str, str]:
    arguments: dict[str, Any] = {
        "board_name": board_name,
        "board_kind": GQLEnum(board_kind),
        "empty": True,
    }
    if workspace_id:
        arguments["workspace_id"] = workspace_id

    query = f"""
    mutation {{
      create_board({gql_args(arguments)}) {{
        id
        name
      }}
    }}
    """
    data = client.execute(query, operation="create_board")
    return data["create_board"]


def get_board_columns(client: MondayClient, board_id: str) -> list[dict[str, Any]]:
    query = f"""
    query {{
      boards(ids: [{gql_value(board_id)}]) {{
        columns {{
          id
          title
          type
          revision
        }}
      }}
    }}
    """
    data = client.execute(query, operation="get_board_columns")
    boards = data.get("boards") or []
    if not boards:
        raise MondayApiError(f"Board {board_id} was not found when querying columns.")
    return boards[0].get("columns") or []


def get_board_groups(client: MondayClient, board_id: str) -> list[dict[str, Any]]:
    query = f"""
    query {{
      boards(ids: [{gql_value(board_id)}]) {{
        groups {{
          id
          title
        }}
      }}
    }}
    """
    data = client.execute(query, operation="get_board_groups")
    boards = data.get("boards") or []
    if not boards:
        raise MondayApiError(f"Board {board_id} was not found when querying groups.")
    return boards[0].get("groups") or []


def rename_deal_name_column(client: MondayClient, board_id: str) -> None:
    columns = get_board_columns(client, board_id)
    name_column = next((column for column in columns if column.get("type") == "name"), None)
    if not name_column:
        log("Warning: could not locate the first name column to rename it to 'Deal Name'.")
        return

    revision = name_column.get("revision")
    if not revision:
        log("Warning: could not read the name column revision. Leaving the first column title as-is.")
        return

    query = f"""
    mutation {{
      update_column(
        board_id: {gql_value(board_id)},
        id: {gql_value(name_column["id"])},
        revision: {gql_value(revision)},
        title: {gql_value("Deal Name")},
        description: {gql_value(DEAL_NAME_COLUMN_DESCRIPTION)},
        column_type: name
      ) {{
        id
        title
      }}
    }}
    """
    try:
        client.execute(query, operation="rename_deal_name_column")
    except MondayApiError as exc:
        log(f"Warning: could not rename the first column to 'Deal Name'. Continuing. Details: {exc}")


def ensure_groups(client: MondayClient, board_id: str) -> dict[str, str]:
    existing_groups = get_board_groups(client, board_id)
    if not existing_groups:
        raise MondayApiError("monday.com created a board without a default group, which this script did not expect.")

    default_group_id = str(existing_groups[0]["id"])
    rename_query = f"""
    mutation {{
      update_group(
        board_id: {gql_value(board_id)},
        group_id: {gql_value(default_group_id)},
        group_attribute: title,
        new_value: {gql_value(GROUP_SPECS[0].title)}
      ) {{
        id
      }}
    }}
    """

    group_ids: dict[str, str] = {}
    previous_group_id = default_group_id

    try:
        client.execute(rename_query, operation="rename_default_group")
        group_ids[GROUP_SPECS[0].key] = default_group_id
    except MondayApiError as exc:
        log(f"Warning: could not rename the default group. Creating a separate 'Sales Desk' group instead. Details: {exc}")
        sales_group = client.execute(
            f"""
            mutation {{
              create_group(
                board_id: {gql_value(board_id)},
                group_name: {gql_value(GROUP_SPECS[0].title)},
                relative_to: {gql_value(default_group_id)},
                position_relative_method: after_at
              ) {{
                id
                title
              }}
            }}
            """,
            operation="create_fallback_sales_group",
        )["create_group"]
        previous_group_id = str(sales_group["id"])
        group_ids[GROUP_SPECS[0].key] = previous_group_id

    for group_spec in GROUP_SPECS[1:]:
        arguments = {
            "board_id": board_id,
            "group_name": group_spec.title,
            "relative_to": previous_group_id,
            "position_relative_method": GQLEnum("after_at"),
            "group_color": group_spec.color,
        }
        query = f"""
        mutation {{
          create_group({gql_args(arguments)}) {{
            id
            title
          }}
        }}
        """
        data = client.execute(query, operation=f"create_group:{group_spec.title}")
        group = data["create_group"]
        previous_group_id = str(group["id"])
        group_ids[group_spec.key] = previous_group_id

    return group_ids


def create_column(
    client: MondayClient,
    board_id: str,
    title: str,
    kind: str,
    description: str,
    after_column_id: str | None,
) -> dict[str, Any]:
    arguments: dict[str, Any] = {
        "board_id": board_id,
        "title": title,
        "description": description,
        "column_type": GQLEnum(kind),
    }
    if after_column_id:
        arguments["after_column_id"] = after_column_id

    query = f"""
    mutation {{
      create_column({gql_args(arguments)}) {{
        id
        title
        type
      }}
    }}
    """
    data = client.execute(query, operation=f"create_column:{title}")
    return data["create_column"]


def update_status_column_settings(
    client: MondayClient,
    board_id: str,
    column_id: str,
    title: str,
    description: str,
    labels: tuple[StatusLabelSpec, ...],
) -> dict[str, Any]:
    columns = get_board_columns(client, board_id)
    target_column = next((column for column in columns if str(column.get("id")) == column_id), None)
    if not target_column or not target_column.get("revision"):
        raise MondayApiError(f"Could not find revision for status column '{title}' ({column_id}).")

    settings = build_status_settings(labels)
    query = f"""
    mutation {{
      update_status_column(
        board_id: {gql_value(board_id)},
        id: {gql_value(column_id)},
        revision: {gql_value(target_column['revision'])},
        title: {gql_value(title)},
        description: {gql_value(description)},
        settings: {gql_value(settings)}
      ) {{
        id
        title
        description
      }}
    }}
    """
    data = client.execute(query, operation=f"update_status_column:{title}")
    return data["update_status_column"]


def ensure_columns(client: MondayClient, board_id: str) -> dict[str, str]:
    columns = get_board_columns(client, board_id)
    first_column = next((column for column in columns if column.get("type") == "name"), None)
    previous_column_id = str(first_column["id"]) if first_column else None
    column_ids: dict[str, str] = {}

    for spec in COLUMN_SPECS:
        try:
            created_column = create_column(
                client,
                board_id=board_id,
                title=spec.title,
                kind="status" if spec.kind == "status" else spec.kind,
                description=spec.description,
                after_column_id=previous_column_id,
            )
            column_id = str(created_column["id"])

            if spec.kind == "status":
                update_status_column_settings(
                    client,
                    board_id=board_id,
                    column_id=column_id,
                    title=spec.title,
                    description=spec.description,
                    labels=spec.labels,
                )

            column_ids[spec.key] = column_id
            previous_column_id = column_id
            log(f"Created column: {spec.title}")
        except MondayApiError as exc:
            if spec.optional:
                log(f"Warning: optional column '{spec.title}' could not be created. Continuing. Details: {exc}")
                continue
            raise

    return column_ids


def create_item(client: MondayClient, board_id: str, group_id: str, item_name: str, column_values: dict[str, Any]) -> dict[str, Any]:
    mutation = f"""
    mutation {{
      create_item(
        board_id: {gql_value(board_id)},
        group_id: {gql_value(group_id)},
        item_name: {gql_value(item_name)},
        column_values: {gql_value(json.dumps(column_values))}
      ) {{
        id
        name
      }}
    }}
    """
    data = client.execute(mutation, operation=f"create_item:{item_name}")
    return data["create_item"]


def create_update(client: MondayClient, item_id: str, body: str) -> dict[str, Any]:
    query = f"""
    mutation {{
      create_update(
        item_id: {gql_value(item_id)},
        body: {gql_value(body)}
      ) {{
        id
      }}
    }}
    """
    data = client.execute(query, operation=f"create_update:{item_id}")
    return data["create_update"]


def create_sample_deals(
    client: MondayClient,
    board_id: str,
    group_ids: dict[str, str],
    column_specs: list[ColumnSpec],
    column_ids: dict[str, str],
) -> list[dict[str, str]]:
    column_by_key = {spec.key: spec for spec in column_specs}
    sample_items: list[dict[str, str]] = []

    for sample in build_sample_deals(date.today()):
        serialized_values: dict[str, Any] = {}
        for key, raw_value in sample.values.items():
            column_id = column_ids.get(key)
            spec = column_by_key.get(key)
            if not column_id or spec is None:
                continue
            value = build_column_value(spec, raw_value)
            if value is not None:
                serialized_values[column_id] = value

        item = create_item(
            client,
            board_id=board_id,
            group_id=group_ids[sample.group_key],
            item_name=sample.name,
            column_values=serialized_values,
        )
        create_update(client, item_id=str(item["id"]), body=sample.update_body)
        sample_items.append({"id": str(item["id"]), "name": str(item["name"]), "group": sample.group_key})
        log(f"Created sample item: {item['name']}")

    return sample_items


def build_summary(
    board: dict[str, str],
    workspace_id: str | None,
    group_ids: dict[str, str],
    column_ids: dict[str, str],
    sample_items: list[dict[str, str]],
    board_kind: str,
    api_version: str,
) -> dict[str, Any]:
    return {
        "board": {
            "id": str(board["id"]),
            "name": str(board["name"]),
            "board_kind": board_kind,
            "workspace_id": workspace_id,
        },
        "api_version": api_version,
        "generated_from": str(ROOT / "tools" / "monday_deal_workflow_setup.py"),
        "groups": group_ids,
        "columns": column_ids,
        "sample_items": sample_items,
        "manual_automation_recipes": MANUAL_AUTOMATIONS,
        "manual_limitations": MANUAL_LIMITATIONS,
        "notes": [
            "This script pins monday API version 2026-01, which was the current stable API version on April 4, 2026.",
            "Native board automations still need to be configured manually in monday.com after the board is created.",
            "Sample updates were added to the sample items to demonstrate audit-trail usage.",
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a monday.com dealership deal workflow board for Sales-to-Finance handoff.")
    parser.add_argument("--board-name", default=DEFAULT_BOARD_NAME, help="Board name to create in monday.com.")
    parser.add_argument(
        "--board-kind",
        default="private",
        choices=("private", "public", "share"),
        help="monday board visibility kind. Default: private.",
    )
    parser.add_argument(
        "--workspace-id",
        default=os.environ.get("MONDAY_WORKSPACE_ID"),
        help="Workspace ID override. Defaults to MONDAY_WORKSPACE_ID or the first accessible default workspace.",
    )
    parser.add_argument(
        "--api-version",
        default=DEFAULT_API_VERSION,
        help=f"monday API version to use. Default: {DEFAULT_API_VERSION}.",
    )
    parser.add_argument(
        "--report-file",
        default=None,
        help="Optional path to write the JSON setup summary.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    token = os.environ.get("MONDAY_API_TOKEN")
    if not token:
        print("MONDAY_API_TOKEN is required.", file=sys.stderr)
        return 1

    client = MondayClient(token=token, api_version=args.api_version)

    try:
        workspace_id = resolve_workspace_id(client, args.workspace_id)
        log(f"Creating board '{args.board_name}'...")
        board = create_board(client, board_name=args.board_name, board_kind=args.board_kind, workspace_id=workspace_id)
        board_id = str(board["id"])

        rename_deal_name_column(client, board_id)
        group_ids = ensure_groups(client, board_id)
        column_ids = ensure_columns(client, board_id)
        sample_items = create_sample_deals(
            client,
            board_id=board_id,
            group_ids=group_ids,
            column_specs=COLUMN_SPECS,
            column_ids=column_ids,
        )
        summary = build_summary(
            board=board,
            workspace_id=workspace_id,
            group_ids=group_ids,
            column_ids=column_ids,
            sample_items=sample_items,
            board_kind=args.board_kind,
            api_version=args.api_version,
        )

        if args.report_file:
            report_path = Path(args.report_file)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
            log(f"Wrote setup summary to {report_path}")

        print(json.dumps(summary, indent=2))
        return 0
    except MondayApiError as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
