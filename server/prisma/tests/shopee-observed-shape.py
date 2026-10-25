"""Run against a disposable PostgreSQL database: PG* environment configures psql."""
import copy,json,pathlib,subprocess

def sql(text):
 return subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-q'],input=text,text=True,capture_output=True)
def lit(v):
 if v is None:return 'NULL'
 if isinstance(v,dict):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
 return "'"+str(v).replace("'","''")+"'"
base=dict(status='PUBLISHED',sourceClaimState='UNKNOWN',recordOrigin='DB_MASTER',checkedAt='2026-10-25T09:00:00Z',postedEarliestAt=None,postedLatestAt=None,county=None,district=None,publicPlaceName=None,publicAddress=None,latitude=None,longitude=None,libraryFileId=None,archiveVersion=None,archiveSha256=None,archiveItemId='SP123-456-01',canonicalUrl='https://shopee.tw/test-i.123.456',evidence={'locationType':'SELLER_CONTACT_REQUIRED','sourceUrl':'https://shopee.tw/test-i.123.456','publicSourceRef':'source:shopee-item/123.456','dateRef':'source:shopee-first-observed/123.456','observedListing':{'provider':'SHOPEE','shopId':'123','itemId':'456','availability':'VISIBLE_PURCHASE_CONTROL','firstObservedAt':'2026-10-25T08:00:00Z'},'publicFacts':{'originalDateLabel':'刊登日期未提供；首次查核 2026-10-25T08:00:00Z'}})
cols=', '.join('"'+k+'" '+('jsonb' if k=='evidence' else 'timestamp' if k.endswith('At') else 'text') for k in base)
setup='CREATE SCHEMA shopee_shape_test; SET search_path=shopee_shape_test; CREATE TABLE "ExternalSourceLead" ('+cols+',CONSTRAINT "SourceRecord_public_shape" CHECK(true));\n'
migration=(pathlib.Path(__file__).parents[1]/'migrations/20261025091000_shopee_observed_source_records/migration.sql').read_text()
assert sql(setup+migration).returncode==0, 'setup/migration failed'
cases=[('bound Shopee observation',copy.deepcopy(base),True)]
for name,path,value in [('missing provider',['evidence','observedListing','provider'],None),('wrong provider',['evidence','observedListing','provider'],'RUTEN'),('wrong shop',['evidence','observedListing','shopId'],'124'),('numeric shop',['evidence','observedListing','shopId'],123),('missing observed time',['evidence','observedListing','firstObservedAt'],None),('future observation',['evidence','observedListing','firstObservedAt'],'2026-10-26T08:00:00Z'),('wrong archive',['archiveItemId'],'SP123-457-01'),('foreign URL',['canonicalUrl'],'https://evil.test/test-i.123.456'),('unbound source',['evidence','sourceUrl'],'https://shopee.tw/test-i.123.457'),('wrong date ref',['evidence','dateRef'],'source:wrong/date'),('missing observation',['evidence','observedListing'],None),('unknown label',['evidence','publicFacts','originalDateLabel'],'unknown'),('original date half known',['postedEarliestAt'],'2026-10-24'),('archive null dates',['recordOrigin'],'ARCHIVE'),('partial region',['county'],'臺北市'),('wrong location type',['evidence','locationType'],'PUBLIC_MEETING_POINT'),('wrong availability',['evidence','observedListing','availability'],'SOLD')]:
 r=copy.deepcopy(base);o=r
 for k in path[:-1]:o=o[k]
 o[path[-1]]=value;cases.append((name,r,False))
for name,fields in [('legacy contact with dates',{'postedEarliestAt':'2026-10-24','postedLatestAt':'2026-10-24','evidence':{}}),('private draft',{'status':'PRIVATE_PENDING','evidence':{}})]:
 r=copy.deepcopy(base);r.update(fields);cases.append((name,r,True))
try:
 for name,row,ok in cases:
  result=sql('SET search_path=shopee_shape_test; INSERT INTO "ExternalSourceLead" ('+','.join('"'+k+'"' for k in row)+') VALUES ('+','.join(lit(v) for v in row.values())+');')
  assert (result.returncode==0)==ok,(name,result.stderr)
  print('PASS',name)
finally:
 assert sql('DROP SCHEMA shopee_shape_test CASCADE;').returncode==0
print(len(cases),'PostgreSQL constraint cases passed')
