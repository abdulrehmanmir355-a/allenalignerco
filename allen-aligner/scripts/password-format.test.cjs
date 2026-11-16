const test=require('node:test'),assert=require('node:assert/strict');
const {compare,getRounds}=require('bcryptjs');
const {isBcryptHash,newPasswordSchema,hashNewPassword,assertPasswordHashWrite}=require('../app/lib/password-format.ts');
test('new passwords are salted bcrypt hashes that verify the original password only',async()=>{
 const password='Synthetic-password-123!';const a=await hashNewPassword(password),b=await hashNewPassword(password);
 assert(isBcryptHash(a));assert.equal(a.length,60);assert.equal(getRounds(a),12);assert.notEqual(a,b);
 assert(await compare(password,a));assert.equal(await compare('incorrect-password',a),false);assertPasswordHashWrite('Doctor',{passwordHash:a});
});
test('doctor writes reject plaintext, empty, malformed, unsupported and accidental update expressions',()=>{
 const values=['plaintext-password-123','',null,42,{increment:1},'$2b$03$'+'a'.repeat(53),'$2b$32$'+'a'.repeat(53),'$2b$12$'+'a'.repeat(52),'$2b$12$'+'!'.repeat(53)];
 for(const passwordHash of values){assert.equal(isBcryptHash(passwordHash),false);assert.throws(()=>assertPasswordHashWrite('Doctor',{passwordHash}),/requires a bcrypt hash/);}
 assertPasswordHashWrite('Doctor',{fullName:'Existing doctor'});assertPasswordHashWrite('Doctor',{passwordHash:undefined});
});
test('the supported legacy bcrypt versions remain valid without double hashing',()=>{
 for(const version of ['2a','2b','2y']){const passwordHash=`$${version}$12$`+'a'.repeat(53);assert(isBcryptHash(passwordHash));assertPasswordHashWrite('Doctor',{passwordHash});}
});
test('registration/password changes reject bcrypt truncation of long UTF-8 passwords',async()=>{
 assert(newPasswordSchema.safeParse('a'.repeat(72)).success);
 assert(newPasswordSchema.safeParse('آ'.repeat(36)).success);
 assert.equal(newPasswordSchema.safeParse('آ'.repeat(37)).success,false);
 assert.equal(newPasswordSchema.safeParse('a'.repeat(73)).success,false);
 await assert.rejects(()=>hashNewPassword('too-short'));
 await assert.rejects(()=>hashNewPassword('آ'.repeat(37)));
});

// Exercise actual repository methods with a recording client; no database connection.
const fs=require('node:fs'),path=require('node:path'),NodeModule=require('node:module'),ts=require('typescript');
const databaseFile=path.resolve(__dirname,'../app/lib/database.ts');
const compiled=ts.transpileModule(fs.readFileSync(databaseFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText;
const databaseModule=new NodeModule(databaseFile,module);
databaseModule.filename=databaseFile;databaseModule.paths=NodeModule._nodeModulePaths(path.dirname(databaseFile));
databaseModule.require=function(spec){if(spec==='server-only')return {};if(spec==='./password-format')return require('../app/lib/password-format.ts');return NodeModule.prototype.require.call(this,spec);};
databaseModule._compile(compiled,databaseFile);
for(const operation of ['create','update','updateMany'])test(`Doctor repository ${operation} refuses malformed credentials before any SQL executes`,async()=>{
 const statements=[];const client={query:async(sql,values)=>{statements.push({sql,values});return {rows:[{id:'synthetic-doctor'}]};}};
 const db=new databaseModule.exports.Database(client);
 for(const passwordHash of ['plaintext-password-123',null,'$2b$12$broken'])await assert.rejects(()=>db.doctor[operation]({where:{id:'synthetic-doctor'},data:{passwordHash}}),/requires a bcrypt hash/);
 assert.equal(statements.length,0);
 const valid='$2b$12$'+'a'.repeat(53);
 await db.doctor[operation]({where:{id:'synthetic-doctor'},data:{passwordHash:valid}});
 assert.equal(statements.length,1);assert(statements[0].values.includes(valid));
});
