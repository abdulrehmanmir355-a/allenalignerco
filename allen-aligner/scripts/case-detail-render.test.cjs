const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=process.env.ALLEN_PROJECT_ROOT||path.resolve(__dirname,'..');
const req=Module.createRequire(path.join(root,'package.json')),ts=req('typescript');
const source=path.join(root,'app/doctor-dashboard/cases/[id]/page.tsx');

async function workspace(plans,currentId,releasedIds){
 const marker=()=>null,now=new Date('2026-10-28T00:00:00Z');
 const c={id:'case-render-test',clinicId:'clinic-render-test',patientReference:'Isolated render fixture',category:'Test',status:'PLANNING',revision:0,createdAt:now,consentAt:now,files:[],events:[],messages:[],plans:plans.map(p=>({...p,createdAt:now,summary:'Test plan',decision:'PENDING'})),labAccess:null};
 const db={portalCase:{findFirst:async()=>c},largeClinicalFile:{findMany:async()=>[]},query:async sql=>sql.includes('SELECT name FROM "Clinic"')?[{name:'Test clinic'}]:sql.includes('SELECT id FROM "TreatmentPlan"')?(currentId?[{id:currentId}]:[]):[]};
 const mocks={
  '../../../components/plan-review-opened':{default:marker},
  '../../../lib/database':{db},
  '../../../lib/portal-auth':{requireDoctor:async()=>({id:'test-doctor',clinicId:c.clinicId,fullName:'Test doctor'}),ownCases:()=>({})},
  '../../../lib/clinical-service':{releasedPlanIds:async()=>new Set(releasedIds)},
  '../../../lib/case-timeline':{caseTimeline:async()=>({entries:[]})},
  '../../../lib/extended-case-workflow':{doctorWorkflowView:async()=>null},
  '../../../lib/case-intake':{decodeCaseIntake:notes=>({notes,intake:null}),decodeRecordFilename:name=>({filename:name.replace(/^\[AA-RECORD:(?:scan|photo|xray)\] /,''),recordType:name.match(/^\[AA-RECORD:(scan|photo|xray)\] /)?.[1]||null})},
 };
 const mod=new Module(source,module);mod.filename=source;mod.paths=Module._nodeModulePaths(path.dirname(source));
 mod.require=function(spec){if(mocks[spec])return {...mocks[spec],__esModule:true};if(spec.startsWith('../../../components/')||spec==='next/link')return {__esModule:true,default:()=>null};if(spec==='next/navigation')return {notFound:()=>{throw Error('Unexpected missing case')}};return Module.prototype.require.call(this,spec);};
 mod._compile(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,source);
 const tree=await mod.exports.default({params:Promise.resolve({id:c.id})});
 const found=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type===marker)found.push(node);walk(node.props?.children);}walk(tree);return {found,tree};
}
test('case with no plan renders without a review-open observer',async()=>assert.equal((await workspace([],undefined,[])).found.length,0));
test('unreleased current plan does not create a review-open observer',async()=>assert.equal((await workspace([{id:'pending',version:1}],'pending',[])).found.length,0));
test('released current plan tracks its exact version',async()=>{const nodes=await workspace([{id:'released',version:1}],'released',['released']);assert.equal(nodes.found.length,1);assert.equal(nodes.found[0].props.planId,'released');});
test('older released plan is not tracked as a newer unreleased version',async()=>assert.equal((await workspace([{id:'new',version:2},{id:'old',version:1}],'new',['old'])).found.length,0));
test('case page renders the Module 10 specialist handoff',async()=>{const {tree}=await workspace([],undefined,[]),text=[];function collect(node){if(typeof node==='string'||typeof node==='number'){text.push(String(node));return;}if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collect);return;}collect(node.props?.children);}collect(tree);const rendered=text.join(' ');assert.match(rendered,/MODULE 10 · CLINICAL TREATMENT PLANNING/);assert.match(rendered,/Maestro 3D Ortho Studio/);assert.match(rendered,/3Shape Clear Aligner Studio/);assert.match(rendered,/secure manual file handoff/i);});
