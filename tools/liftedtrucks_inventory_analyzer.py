from __future__ import annotations
import argparse,copy,html,json,re,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
from urllib.parse import unquote,urljoin
import requests
import cloudscraper
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'runtime'/'reports'
CACHE=OUT/'liftedtrucks_detail_cache'
URLS=['https://www.liftedtrucks.com/used-inventory/ram-trucks.htm','https://www.liftedtrucks.com/used-inventory/jeep.htm']
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
SCRAPER=cloudscraper.create_scraper(browser={'browser':'chrome','platform':'windows','mobile':False})
CHROMEDRIVER=ROOT/'automation'/'facebook-marketplace-lister'/'drivers'/'chromedriver.exe'
CHROME_CANDIDATES=[ROOT/'automation'/'facebook-marketplace-lister'/'chrome-for-testing'/'chrome-win64'/'chrome.exe',Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),Path('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe')]
BASE_PREFS={'widgetClasses':'spacing-reset d-none','pageSize':'100','listing.boost.order':'account,make,model,bodyStyle,trim,optionCodes,modelCode,fuelType','removeEmptyFacets':'true','removeEmptyConstraints':'true','displayerInstanceId':'','required.display.sets':'TITLE,IMAGE_ALT,IMAGE_TITLE,PRICE,FEATURED_ITEMS,CALLOUT,LISTING,HIGHLIGHTED_ATTRIBUTES,SUPPLEMENTAL_TITLE','required.display.attributes':'accountCity,accountCountry,accountId,accountName,accountState,accountZipcode,askingPrice,attributes,autodataCaId_att_data,bed,bodyStyle,cab,carfaxIconUrl,carfaxIconUrlBlackWhite,carfaxUrl,carfaxValueBadgeAltText,categoryName,certified,chromeId_att_data,cityMpg,classification,classificationName,comments,courtesy,cpoChecklistUrl,daysOnLot,dcpaisVideoToken_att_data,deliveryDateRange,doors,driveLine,ebayAuctionId,eleadPrice,eleadPriceLessOEMCash,engine,engineSize,equipment,extColor,exteriorColor,fuelType,globalVehicleTrimId,gvLongTrimDescription,gvTrim,hasCarFaxReport,hideInternetPrice,highwayMpg,id,incentives,intColor,interiorColor,interiorColorCode,internetComments,internetPrice,inventoryDate,invoicePrice,isElectric_att_b,key,location,make,marketingTitle,mileage,model,modelCode,msrp,normalExteriorColor,normalFuelType,normalInteriorColor,numSaves,odometer,oemSerialNumber,oemSourcedMerchandisingStatus,optionCodes,options,packageCode,packages_internal,parent,parentId,paymentMonthly,payments,primary_image,propertyDescription,retailValue,saleLease,salePrice,sharedVehicle,status,stockNumber,transmission,trim,trimLevel,type,uuid,video,vin,warrantyDescription,wholesalePrice,year,cpoTier','required.display.attributes.extra':'','geoLocationEnabled':'false','defaultGeoDistRadius':'0','geoRadiusValues':'0,5,25,50,100,250,500,1000','showCertifiedFranchiseVehiclesOnly':'false','showFranchiseVehiclesOnly':'true','showOffSiteInventoryBanner':'false','showPhotosViewer':'true','offsetSharedVehicleImageByOne':'false','carfaxLogoBlackWhite':'false','hideCertifiedDefaultLogo':'false','sorts':'year,normalBodyStyle,normalExteriorColor,odometer,internetPrice','sortsTitles':'YEAR,BODYSTYLE,COLOR,MILEAGE,PRICE','inventoryDateFormat':'MM_DD_YYYY_FORMAT','showEffectiveStartDate':'true','showIncentiveTitleSubText':'true','showIncentiveAmountAndLabel':'true','showIncentiveDisclaimer':'true','showIncentiveEffectiveDates':'true','numberOfSpotlightVehicles':'0','disableGeodistSort':'false','removeOdometerOnNew':'true','finalPriceOverrideField':''}
PAYLOAD_HINTS={'https://www.liftedtrucks.com/used-inventory/ram-trucks.htm':{'pageAlias':'SITEBUILDER_USED_RAM_TRUCKS_FOR_SALE_1','pageId':'liftedtrucks_SITEBUILDER_USED_RAM_TRUCKS_FOR_SALE_1','listing.config.id':'auto-usedram,auto-dodgeram','facetInstanceId':'INVENTORY_LISTING_DEFAULT_AUTO_USED:inventory-data-bus1_1739825192'},'https://www.liftedtrucks.com/used-inventory/jeep.htm':{'pageAlias':'SITEBUILDER_LIFTED_TRUCKS_JEEP_INVENTORY_IN_PHOENIX__AZ_1','pageId':'liftedtrucks_SITEBUILDER_LIFTED_TRUCKS_JEEP_INVENTORY_IN_PHOENIX__AZ_1','listing.config.id':'auto-jeep','facetInstanceId':'INVENTORY_LISTING_DEFAULT_AUTO_USED:inventory-data-bus1_1739825192'}}
def get(u,t=30,r=3):
 x=None
 for n in range(r):
  try:
   z=requests.get(u,timeout=t,headers={'User-Agent':UA});z.raise_for_status();return z.text
  except Exception as e:
   x=e;time.sleep((15 if '429' in str(e) else .6)*(n+1))
 raise RuntimeError(f'GET {u} failed: {x}')
def post(u,p,t=60,r=3):
 x=None
 for n in range(r):
  try:
   z=SCRAPER.post(u,json=p,timeout=t,headers={'User-Agent':UA,'Content-Type':'application/json'});z.raise_for_status();return z.json()
  except Exception as e:
   x=e;time.sleep(.6*(n+1))
 raise RuntimeError(f'POST {u} failed: {x}')
def browser():
 o=webdriver.ChromeOptions();o.add_argument('--headless=new');o.add_argument('--disable-gpu');o.add_argument('--no-sandbox');o.add_argument('--window-size=1400,1200')
 for p in CHROME_CANDIDATES:
  if p.exists(): o.binary_location=str(p);break
 return webdriver.Chrome(service=Service(str(CHROMEDRIVER.resolve())),options=o)
def bfetch(d,p):
 s='return fetch(\"/api/widget/ws-inv-data/getInventory\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify(arguments[0])}).then(r=>r.text().then(t=>({status:r.status,text:t}))).catch(e=>({status:0,text:String(e)}));'
 o=d.execute_script(s,p)
 if int(o.get('status') or 0)!=200: raise RuntimeError(f"browser fetch failed: {o}")
 return json.loads(o['text'])
def payload(h):
 m=re.search(r'fetch\("/api/widget/ws-inv-data/getInventory",\{method:"POST",headers:\{"Content-Type":"application/json"\},body:decodeURI\("([^"]+)"\)',h)
 if not m: raise RuntimeError('inventory payload not found')
 return json.loads(unquote(m.group(1)))
def inv(url):
 d=browser();seen=[];seen_set=set()
 try:
  d.get(url);time.sleep(6)
  starts=sorted({int(m.group(1)) for a in d.find_elements('tag name','a') for href in [a.get_attribute('href') or ''] for m in [re.search(r'[?&]start=(\d+)',href)] if m})
  step=min([s for s in starts if s>0],default=27);last=max(starts,default=0);pages=[url.split('?',1)[0]]+[f"{url.split('?',1)[0]}?start={s}" for s in range(step,last+1,step)]
  brand='Ram' if '/ram-trucks' in url else 'Jeep'
  for page in pages:
   d.get(page);time.sleep(4)
   for a in d.find_elements('xpath',f'//a[contains(@href,\"/used/{brand}/\")]'):
    href=(a.get_attribute('href') or '').strip()
    if href and href not in seen_set:
     seen_set.add(href);seen.append({'link':href,'_src':url})
 finally:
  d.quit()
 return seen
def txt(x): return re.sub(r'\s+',' ',html.unescape(str(x or ''))).strip()
def num(x):
 d=re.sub(r'[^\d]','',str(x or ''));return int(d) if d else None
def flt(x):
 d=re.sub(r'[^\d.]','',str(x or ''))
 try:return float(d) if d else None
 except:return None
def amap(i): return {str(e.get('name') or '').strip():e for e in (i.get('attributes') or []) if isinstance(e,dict) and str(e.get('name') or '').strip()}
def tmap(i): return {str(e.get('name') or '').strip():e.get('value') for e in (i.get('trackingAttributes') or []) if isinstance(e,dict) and str(e.get('name') or '').strip()}
def val(i,*ns):
 a=amap(i);t=tmap(i)
 for n in ns:
  if n in a and a[n].get('value') not in (None,''): return txt(a[n].get('value'))
  if n in t and t[n] not in (None,''): return txt(t[n])
  if i.get(n) not in (None,''): return txt(i.get(n))
def imgs(i): return [txt(e.get('uri')) for e in (i.get('images') or []) if isinstance(e,dict) and txt(e.get('uri'))]
def carfax(i):
 for e in (i.get('callout') or []):
  h=txt((e or {}).get('href'))
  if 'carfax.com' in h.lower(): return h
def notes(h):
 m=re.search(r'### Dealer Notes\s+(.*?)(?:\n### |\n## |\Z)',h,re.S)
 if m:return re.sub(r'\n{3,}','\n\n',html.unescape(m.group(1))).strip()
 m=re.search(r'<div id="dealernotes1-app-root".*?<div class="content">(.*?)</div>',h,re.S)
 if not m:return ''
 s=re.sub(r'<br\s*/?>','\n\n',m.group(1),flags=re.I);s=re.sub(r'</p>','\n\n',s,flags=re.I);s=re.sub(r'<[^>]+>','',s)
 return re.sub(r'\n{3,}','\n\n',html.unescape(s)).strip()
def grab(p,s):
 m=re.search(p,s or '',re.I|re.S)
 return txt(m.group(1)) if m else None
def paras(s): return [txt(p) for p in re.split(r'\n\s*\n',s or '') if txt(p)]
def pkg(s): return list(dict.fromkeys(txt(m.group(1)) for m in re.finditer(r'\b([A-Z][A-Za-z0-9&\- ]+ Pack)\b',s or '')))
def tech(s):
 m=re.search(r'Installed by our Certified Lift Tech:\s*([A-Za-z .\'-]+)',s or '',re.I)
 return txt(m.group(1)) if m else None
def wheel(s):
 for p in [r'(\d{2})-inch ([A-Za-z0-9 .&/\-\']+?) Wheels',r'(\d{2})\" ([A-Za-z0-9 .&/\-\']+?) Wheels']:
  m=re.search(p,s or '',re.I)
  if m:
   z=txt(m.group(2));return {'size_inches':int(m.group(1)),'brand_model':z,'brand':z.split()[0] if z else None,'style':z,'offset_estimate':'[INFERRED] likely 0 mm to -24 mm unless exact backspacing is disclosed'}
 return {}
def tire(s):
 for p in [r'(\d{2,3}X\d{1,2}\.\d{2}R\d{2}) ([A-Za-z0-9 .&/\-\']+?) Tires',r'(\d{3}/\d{2}R\d{2}) ([A-Za-z0-9 .&/\-\']+?) Tires']:
  m=re.search(p,s or '',re.I)
  if m:
   z=txt(m.group(2));u=z.upper();tp='[INFERRED] RT' if 'RIDGE GRAPPLER' in u else ('[INFERRED] MT' if 'TRAIL GRAPPLER' in u or 'MUD' in u else ('[INFERRED] AT' if 'TERRA' in u or 'ALL-TERRAIN' in u else '[INFERRED] unknown'))
   return {'size':m.group(1).upper(),'brand_model':z,'brand':z.split()[0] if z else None,'type':tp}
 return {}
def lift(s):
 for p in [r'(\d(?:\.\d+)?)\s*-\s*inch ([A-Za-z0-9 .&/\-\']+?) (Suspension Lift|Leveling Kit|Lift Kit|Body Lift|Lift)',r'(\d(?:\.\d+)?)\s*inch ([A-Za-z0-9 .&/\-\']+?) (Suspension Lift|Leveling Kit|Lift Kit|Body Lift|Lift)']:
  m=re.search(p,s or '',re.I)
  if m:
   z=txt(m.group(2));t='leveling' if 'level' in m.group(3).lower() else ('body' if 'body' in m.group(3).lower() else 'suspension')
   return {'type':t,'estimated_height_inches':float(m.group(1)),'likely_brand':z.split()[0] if z else None,'brand_model':z,'evidence':txt(m.group(0))}
 return {}
def shocks(s):
 out=[]
 for p in [r'(Fox [0-9.]+ [A-Za-z ]+ Shocks?)',r'(Bilstein [A-Za-z0-9 ]+ Shocks?)',r'(Vertex [A-Za-z0-9 ]+ Shocks?)',r'(M1 Monotube Shocks?)']:
  for m in re.finditer(p,s or '',re.I):
   z=txt(m.group(1))
   if z and z not in out: out.append(z)
 return out
def other(s):
 pats=[(r'window tint','Professionally installed window tint'),(r'alignment','Alignment included'),(r'steering stabilizer','Steering stabilizer'),(r'running boards|side steps|rock rails|rock sliders','Steps / sliders'),(r'light bar|pod lights|off-road lights|led lighting','Auxiliary / upgraded lighting'),(r'bumper','Bumper mention'),(r'winch','Winch'),(r'fender flares','Fender flare mention'),(r'exhaust','Exhaust mention'),(r'skid plates','Skid plates')]
 return [label for p,label in pats if re.search(p,s or '',re.I)]
def after(i):
 p=i.get('trackingPricing') or {};c=flt(p.get('msrp')) or flt(p.get('retailValue'))
 return {'amount_usd':int(c) if c and 1000<=c<=25000 else None,'label':'[INFERRED] site MSRP-like field appears to represent accessory/package value, not original vehicle MSRP'}
def req(c):
 h=float((c['lift'].get('estimated_height_inches') or 0));r=[];ts=str((c['tire'].get('size') or ''))
 if c['make']=='Ram' and h>=5.5:r+=['[INFERRED] front crossmembers / drop brackets','[INFERRED] knuckle / strut correction hardware','[INFERRED] rear spring or spacer correction','[INFERRED] sway-bar and alignment correction']
 if c['make']=='Jeep' and h>=2.5:r+=['[INFERRED] bump-stop extensions','[INFERRED] sway-bar links','[INFERRED] track-bar correction','[INFERRED] caster correction arms / brackets']
 if c['make']=='Jeep' and '37X' in ts:r+=['[INFERRED] spare-carrier reinforcement','[INFERRED] tire-size calibration']
 return r
def corners(c):
 h=float((c['lift'].get('estimated_height_inches') or 0));ts=str((c['tire'].get('size') or ''));r=[]
 if c['make']=='Jeep' and '37X' in ts and h<=3:r+=['[INFERRED] gearing not mentioned for 37s','[INFERRED] steering upgrades not mentioned for 37s']
 if c['make']=='Ram' and h>=5.5:r+=['[INFERRED] tie rods / UCAs not mentioned','[INFERRED] calibration / gearing not mentioned']
 return r or ['[INFERRED] hidden correction parts cannot be confirmed from the listing']
def tier(c):
 b=str(c['lift'].get('likely_brand') or '').lower();s=' '.join(c['shocks']).lower()
 if b=='bds' or 'fox' in s:return '[INFERRED] upper-mid to premium dealer build'
 if b in {'zone','readylift'}:return '[INFERRED] mid-tier dealer build'
 return '[INFERRED] unknown tier'
def street(c):
 bm=str(c['tire'].get('brand_model') or '').lower();sz=str(c['tire'].get('size') or '')
 if 'ridge grappler' in bm:return '[INFERRED] street-biased hybrid rugged-terrain setup with real trail capability'
 if '37X' in sz:return '[INFERRED] off-road biased; still daily-driveable if alignment and gearing are right'
 return '[INFERRED] mixed-use build with visual lift emphasis'
def ride(c):
 s=' '.join(c['shocks']).lower()
 if 'fox 2.0' in s:return '[INFERRED] firmer than stock but controlled, with better damping than entry-level white-body shocks'
 if c['lift']:return '[INFERRED] taller and heavier than stock with moderate harshness from wheel/tire mass'
 return '[INFERRED] unknown'
def weak(c):
 return (['[INFERRED] front-end wear rises with 35-inch tire mass','[INFERRED] braking load and tie-rod stress increase'] if c['make']=='Ram' else ['[INFERRED] JL steering / ball-joint load rises on 37s','[INFERRED] spare carrier and tailgate load become concerns']) if c['make'] in {'Ram','Jeep'} else []
def reliab(c):
 sz=str(c['tire'].get('size') or '')
 if '37X' in sz:return ['[INFERRED] steering, axle, and bearing stress rise on 37s','[INFERRED] calibration and alignment neglect will destroy tires quickly']
 if '35X' in sz:return ['[INFERRED] wheel-bearing and front-end wear rise over stock','[INFERRED] unsprung weight hurts stopping distance and shock life']
 return ['[INFERRED] no special pattern confirmed beyond normal lifted-vehicle wear']
def improve(c):
 sz=str(c['tire'].get('size') or '');r=[]
 if c['make']=='Jeep' and '37X' in sz:r+=['[INFERRED] add / verify adjustable track bars and caster correction','[INFERRED] re-gear if stock ratio remains','[INFERRED] reinforce spare carrier and steering links']
 if c['make']=='Ram':r+=['[INFERRED] verify tie-rod, UCA, and wheel-bearing condition','[INFERRED] document exact alignment specs and recalibration']
 return r or ['[INFERRED] confirm every correction part on the install invoice']
def analyze(i):
 url=urljoin('https://www.liftedtrucks.com',i.get('link') or '');proxy='https://r.jina.ai/http://'+url.replace('https://','',1);CACHE.mkdir(parents=True,exist_ok=True);slug=re.sub(r'[^A-Za-z0-9._-]+','_',url.rsplit('/',1)[-1]);cp=CACHE/f'{slug}.txt'
 if cp.exists(): page=cp.read_text(encoding='utf-8')
 else:
  time.sleep(1.5);page=get(proxy,60,6);cp.write_text(page,encoding='utf-8')
 note=notes(page);ps=paras(note);mod=ps[0] if ps else ''
 heads=re.findall(r'^# Used (.+)$',page,re.M);headline=heads[1] if len(heads)>1 else (heads[0] if heads else '')
 y=grab(r'Used (\d{4}) ',headline) or grab(r'Used (\d{4}) ',page);mk=grab(r'Used \d{4} ([A-Za-z]+) ',headline) or grab(r'Used \d{4} ([A-Za-z]+) ',page);md=grab(r'Used \d{4} [A-Za-z]+ ([A-Za-z0-9/\-]+)',headline) or grab(r'Used \d{4} [A-Za-z]+ ([A-Za-z0-9/\-]+)',page);tr=txt(headline.replace(f'{y} {mk} {md}','').strip()) if headline and y and mk and md else ''
 sb=grab(r'(Exterior Color .*?Stock Number [A-Z0-9]+)',page) or page
 c={'src':i.get('_src'),'url':url,'year':num(y),'make':mk,'model':md,'trim':tr,'stock':grab(r'Stock Number ([A-Z0-9]+)',sb),'mileage':num(grab(r'Odometer ([\d,]+ miles)',sb)),'vehicle_price':num(grab(r'Vehicle Price\$([\d,]+)',page)),'featured_price':num(grab(r'Featured Price\$([\d,]+)',page)),'after':{'amount_usd':num(grab(r'Aftermarket Accessories\$([\d,]+)',page)),'label':'[INFERRED] accessory package value shown by the dealer as Aftermarket Accessories'},'engine':grab(r'Engine (.*?) VIN',sb),'trans':grab(r'Transmission (.*?) Drivetrain',sb) or grab(r'Transmission (.*?)$',sb),'drive':grab(r'Drivetrain (.*?) Engine',sb),'ext':grab(r'Exterior Color (.*?) Interior Color',sb),'int':grab(r'Interior Color (.*?) Odometer',sb) or grab(r'Interior Color (.*?) Transmission',sb),'vin':grab(r'VIN ([A-HJ-NPR-Z0-9]{17})',sb) or txt(i.get('vin')),'pkgs':pkg(note),'tech':tech(note),'lift':lift(mod),'wheel':wheel(mod),'tire':tire(mod),'shocks':shocks(mod),'other':other(mod),'imgs':num(grab(r'Photo 1 of (\d+)',page)) or 0,'carfax':grab(r'\((https://www\.carfax\.com/vehiclehistory/[^)]+)\)',page),'body':grab(r'Body/Seating (.*?)/(?:\d+ seats|\d+ seat)',sb) or ('Truck' if mk=='Ram' else 'SUV'),'cond':'Used'}
 note_p=[]
 if c['lift']: note_p.append(f"Dealer note explicitly calls out a {c['lift']['estimated_height_inches']}-inch {c['lift']['brand_model']} {c['lift']['type']} lift.")
 if c['shocks']: note_p.append('Shocks named: '+', '.join(c['shocks'])+'.')
 if c['wheel']: note_p.append(f"Wheel package named: {c['wheel']['size_inches']}-inch {c['wheel']['brand_model']} wheels.")
 if c['tire']: note_p.append(f"Tire package named: {c['tire']['size']} {c['tire']['brand_model']} tires.")
 if c['tech']: note_p.append(f"Dealer credits install to certified lift tech {c['tech']}.")
 if c['pkgs']: note_p.append('Factory / option packs referenced: '+', '.join(c['pkgs'])+'.')
 miss=[k for k,v in {'year':c['year'],'make':c['make'],'model':c['model'],'trim':c['trim'],'vin':c['vin'],'mileage':c['mileage'],'price':c['featured_price'] or c['vehicle_price'],'engine':c['engine'],'transmission':c['trans'],'drivetrain':c['drive'],'exterior_color':c['ext'],'interior_color':c['int']}.items() if v in (None,'',[])]
 score=(2 if ps else 0)+(2 if c['lift'] else 0)+(1 if c['wheel'] else 0)+(1 if c['tire'] else 0)+(1 if c['shocks'] else 0)
 conf='High' if score>=6 else ('Medium' if score>=3 else 'Low')
 cost=[]
 lb=str(c['lift'].get('likely_brand') or '').lower();h=float((c['lift'].get('estimated_height_inches') or 0));lr='$2,200-$3,600' if lb=='bds' else ('$1,600-$2,800' if lb=='zone' else ('$900-$1,900' if lb=='readylift' else ('$1,800-$3,200' if h>=5.5 else ('$1,000-$2,400' if h>=2.5 else '$500-$1,500'))))
 for a,b in [('Lift / suspension hardware',lr),('Shock package','$600-$1,200' if c['shocks'] else '$0-$400'),('Wheel set','$1,200-$2,200' if c['wheel'] else '$0'),('Tire set','$1,500-$2,400' if c['tire'] else '$0'),('Mount, balance, alignment, install labor','$1,200-$2,800' if h>=5.5 else '$800-$2,000')]: cost.append({'line_item':a,'estimated_cost':b})
 if any('window tint' in x.lower() for x in c['other']): cost.append({'line_item':'Window tint','estimated_cost':'$250-$700'})
 return {'vehicle_key':f"{c['year']} {c['make']} {c['model']} {c['trim']} [{c['vin']}]",'section_1_raw_vehicle_data':{'year':c['year'],'make':c['make'],'model':c['model'],'trim':c['trim'],'vin':c['vin'],'stock_number':c['stock'],'mileage':c['mileage'],'price_usd':c['featured_price'] or c['vehicle_price'],'vehicle_price_usd':c['vehicle_price'],'featured_price_usd':c['featured_price'],'aftermarket_price_value_usd':c['after']['amount_usd'],'aftermarket_price_note':c['after']['label'],'engine':c['engine'],'transmission':c['trans'],'drivetrain':c['drive'],'exterior_color':c['ext'],'interior_color':c['int'],'dealer_notes':'[Not reproduced verbatim here due copyright limits. See detailed paraphrase and source listing URL below.]','dealer_notes_detailed_paraphrase':' '.join(note_p) if note_p else '[INFERRED] dealer note exists but no clean mod package string was machine-extracted.','listing_url':c['url'],'inventory_source_url':c['src'],'carfax_url':c['carfax'],'image_count':c['imgs'],'body_style':c['body'],'condition':c['cond']},'section_2_modification_detection':{'lift_kit':{'type':c['lift'].get('type') or '[INFERRED] unknown','estimated_height_inches':c['lift'].get('estimated_height_inches') or '[INFERRED] unknown','likely_brand':c['lift'].get('likely_brand') or '[INFERRED] unknown','brand_model':c['lift'].get('brand_model') or '[INFERRED] unknown','evidence':c['lift'].get('evidence') or '[INFERRED] no explicit lift string extracted'},'suspension_components':{'control_arms':'[INFERRED] not explicitly listed in dealer note','shocks_struts':c['shocks'] or ['[INFERRED] unknown'],'springs':'[INFERRED] depend on the named kit; dealer note does not enumerate them','steering_upgrades':'[INFERRED] not explicitly listed in dealer note'},'wheels':{'size_inches':c['wheel'].get('size_inches') or '[INFERRED] unknown','offset_estimate':c['wheel'].get('offset_estimate') or '[INFERRED] unknown','style':c['wheel'].get('style') or '[INFERRED] unknown'},'tires':{'size':c['tire'].get('size') or '[INFERRED] unknown','type':c['tire'].get('type') or '[INFERRED] unknown','brand':c['tire'].get('brand') or '[INFERRED] unknown','brand_model':c['tire'].get('brand_model') or '[INFERRED] unknown'},'other_mods':c['other'] or ['[INFERRED] none clearly stated beyond the primary suspension / wheel / tire package']},'section_3_build_reverse_engineering':{'most_likely_lift_setup':(f"Most likely using the named {c['lift'].get('brand_model')} {c['lift'].get('type')} lift with the dealer-specified shock upgrade." if c['lift'] else '[INFERRED] lifted dealer build present, but exact kit string was not extracted'),'required_supporting_mods':req(c),'likely_corners_cut':corners(c),'build_quality_tier':tier(c)},'section_4_performance_and_use_analysis':{'street_vs_offroad_balance':street(c),'ride_quality_estimate':ride(c),'weak_points':weak(c),'long_term_reliability_concerns':reliab(c)},'section_5_replication_guide':{'parts_list_prioritized':[x for x in [c['lift'].get('brand_model'),', '.join(c['shocks']) if c['shocks'] else None,c['wheel'].get('brand_model'),c['tire'].get('brand_model'),*c['other']] if x],'estimated_cost_breakdown':cost,'install_difficulty_1_to_10':8 if h>=5.5 else (7 if c['make']=='Jeep' and h>=2.5 else (6 if h>0 else 4)),'what_to_upgrade_or_change':improve(c)},'section_6_data_extraction_notes':{'missing_data':miss,'confidence_level':conf,'assumptions':['[INFERRED] aftermarket package value uses the dealer-visible Aftermarket Accessories figure when available','[INFERRED] wheel offset, hidden correction parts, and gear ratio are estimated unless the listing explicitly names them']}}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--workers',type=int,default=10);ap.add_argument('--url',action='append',dest='urls');a=ap.parse_args();urls=a.urls or URLS;items=[]
 for u in urls: items+=inv(u)
 out=[]
 with ThreadPoolExecutor(max_workers=max(1,a.workers)) as ex:
  fs={ex.submit(analyze,i):i for i in items}
  for f in as_completed(fs): out.append(f.result())
 out.sort(key=lambda r:(str(r['section_1_raw_vehicle_data'].get('make') or ''),str(r['section_1_raw_vehicle_data'].get('model') or ''),str(r['section_1_raw_vehicle_data'].get('year') or ''),str(r['section_1_raw_vehicle_data'].get('vin') or '')))
 report={'generated_at':time.strftime('%Y-%m-%d %H:%M:%S %Z'),'inventory_counts':{**{u:sum(1 for i in items if i.get('_src')==u) for u in urls},'total_vehicles':len(out)},'vehicles':out}
 OUT.mkdir(parents=True,exist_ok=True);tag=time.strftime('%Y%m%d_%H%M%S');jp=OUT/f'liftedtrucks_inventory_analysis_{tag}.json';jp.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'ok':True,'json_report':str(jp),'counts':report['inventory_counts']},indent=2))
if __name__=='__main__': main()
