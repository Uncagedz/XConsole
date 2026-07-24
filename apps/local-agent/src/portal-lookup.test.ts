import { describe, expect, it } from 'vitest';
import {
  normalizePortalFields,
  parseCarfaxReport,
  parseOneMicroHistory,
  parseOneMicroKey,
  parseReconActivity,
  parseReconRepairOrder,
  parseReconStage,
} from './portal-result.js';

describe('portal VIN result normalization', () => {
  it('normalizes ReconVision fields without inventing missing values', () => {
    expect(normalizePortalFields('reconvision', {
      stage: ' Mechanical ',
      openWork: 'Inspection\n• Tires; Detail',
      frontlineReady: 'Not ready',
    })).toEqual({
      stage: 'Mechanical',
      openWork: ['Inspection', 'Tires', 'Detail'],
      frontlineReady: false,
    });
  });

  it('normalizes 1Micro key location and holder', () => {
    expect(normalizePortalFields('onemicro', {
      location: ' Key cabinet 4 ',
      holder: ' Service lane ',
    })).toEqual({
      location: 'Key cabinet 4',
      holder: 'Service lane',
    });
  });

  it('reads the ReconVision department from its live result table layout', () => {
    expect(parseReconStage(
      'invoice\tdepartment\tupdated\nTVC3701099\tArchived\t02/19/2026 10:40AM',
    )).toBe('Archived');
  });

  it('parses dealer CARFAX highlights without treating the report fee as vehicle value', () => {
    const summary = [
      'CARFAX Report',
      'US $49.99',
      '74,635 mi',
      'Accident Reported',
      '16 Service History Records',
      'CARFAX 1-Owner Vehicle',
      'Event 1',
      'Accident reported: 05/15/2024.',
      'CARFAX History-Based Value',
      '$41,912',
      'No total loss reported to CARFAX.',
      'No airbag deployment reported to CARFAX.',
      'No indication of an odometer rollback.',
      'No open recalls reported to CARFAX.',
    ].join('\n');

    expect(parseCarfaxReport(summary, 'https://www.carfaxonline.com/vhr/4JGFF5KE9PA946662')).toMatchObject({
      owners: 1,
      accidents: 1,
      service: '16 service history records',
      serviceRecords: 16,
      carfaxValue: 41912,
      mileage: 74635,
      highlights: [
        '1 owner vehicle',
        '1 accident event reported',
        '16 service history records',
        'No total loss reported',
        'No airbag deployment reported',
        'No odometer rollback indicated',
        'No open recalls reported',
      ],
      reportUrl: 'https://www.carfaxonline.com/vhr/4JGFF5KE9PA946662',
    });
  });

  it('extracts ReconVision work, ownership, and timing for a repair order', () => {
    expect(parseReconRepairOrder([
      'RO Number: TVC3701099',
      'Department: Mechanical',
      'Technician: Jordan Lee',
      'Service Advisor: Alex Smith',
      'Opened: 07/20/2026 9:10 AM',
      'Completed: 07/22/2026 4:30 PM',
      'Replaced front brake pads and inspected rotors',
      'Oil and filter service completed',
    ].join('\n'), 'https://app.reconvision.com/work_orders/123')).toMatchObject({
      repairOrder: 'TVC3701099',
      department: 'Mechanical',
      technician: 'Jordan Lee',
      advisor: 'Alex Smith',
      completedAt: '07/22/2026 4:30 PM',
      workPerformed: [
        'Replaced front brake pads and inspected rotors',
        'Oil and filter service completed',
      ],
    });
  });

  it('reads the authoritative ReconVision activity feed and separates repairs from admin work', () => {
    const events = parseReconActivity([
      '01/24/2026 10:20AM',
      'Mark Hridin',
      'completed service Water Pump for Work Order TVC3624015',
      '01/27/2026 12:50PM',
      'Juan Cardier',
      'completed service Body Work - General Repair (body) for Work Order TVC3624015',
      '01/27/2026 3:49PM',
      'Sean Childrey',
      'completed service Photos for Work Order TVC3624015',
      '01/29/2026 4:06PM',
      'Julian Hernandez',
      'completed task Close RO from #3624015',
    ].join('\n'));

    expect(events[0]).toMatchObject({
      actor: 'Julian Hernandez',
      action: 'task',
      repair: false,
    });
    expect(events.filter((event) => event.repair)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        occurredAt: '01/27/2026 12:50PM',
        technician: 'Juan Cardier',
        description: 'Body Work - General Repair (body)',
      }),
      expect.objectContaining({
        occurredAt: '01/24/2026 10:20AM',
        technician: 'Mark Hridin',
        description: 'Water Pump',
      }),
    ]));
  });

  it('reads technician names when ReconVision renders each activity as one text line', () => {
    const events = parseReconActivity([
      '01/24/2026 10:20AM',
      'Mark Hridin completed service Water Pump for Work Order #TVC3624015',
      '01/27/2026 12:50PM',
      'Juan Cardier completed service Body Work - General Repair (body) for Work Order #TVC3624015',
      '01/27/2026 3:49PM',
      'Sean Childrey completed service Photos for Work Order #TVC3624015',
    ].join('\n'));

    expect(events.filter((event) => event.repair)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        occurredAt: '01/27/2026 12:50PM',
        actor: 'Juan Cardier',
        technician: 'Juan Cardier',
        description: 'Body Work - General Repair (body)',
      }),
      expect.objectContaining({
        occurredAt: '01/24/2026 10:20AM',
        actor: 'Mark Hridin',
        technician: 'Mark Hridin',
        description: 'Water Pump',
      }),
    ]));
  });

  it('extracts the last 1Micro key custodian, time, and useful photo', () => {
    expect(parseOneMicroKey([
      'Tag Location :',
      'Drawer 3, slot 17',
      'Last Checked Out By: Taylor Morgan',
      'Last Checked Out: 07/23/2026 2:15 PM',
    ].join('\n'), [
      'https://www.1micro.net/logo.svg',
      'https://www.1micro.net/key-images/vehicle-123.jpg',
    ])).toMatchObject({
      location: 'Drawer 3, slot 17',
      holder: 'Taylor Morgan',
      lastCheckedOutAt: '07/23/2026 2:15 PM',
      keyImageUrl: 'https://www.1micro.net/key-images/vehicle-123.jpg',
    });
  });

  it('extracts the latest 1Micro checkout from descending key history', () => {
    expect(parseOneMicroHistory([
      {
        createdOn: '2026-07-22 15:39:38 EDT',
        createdBy: 'ALFONSO REYES',
        closedOn: '2026-07-22 15:39:48 EDT',
        closedBy: 'ALFONSO REYES',
        event: 'Return',
        kiosk: 'Taverna Collection Sales',
        tagId: '1968',
        reason: null,
      },
      {
        createdOn: '2026-07-22 15:01:36 EDT',
        createdBy: 'ALFONSO REYES',
        closedOn: '2026-07-22 15:01:54 EDT',
        closedBy: 'ALFONSO REYES',
        event: 'Remove',
        kiosk: 'Taverna Collection Sales',
        tagId: '1968',
        reason: 'Demo',
      },
    ], ['https://www.1micro.net/history/key-1968.jpg'])).toMatchObject({
      lastCheckedOutBy: 'ALFONSO REYES',
      lastCheckedOutAt: '2026-07-22 15:01:36 EDT',
      keyImageUrl: 'https://www.1micro.net/history/key-1968.jpg',
      activity: [
        'Return · ALFONSO REYES · 2026-07-22 15:39:38 EDT',
        'Remove · ALFONSO REYES · 2026-07-22 15:01:36 EDT · Demo',
      ],
    });
  });
});
