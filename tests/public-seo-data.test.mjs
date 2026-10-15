import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

test('public search data is read-only, anonymous and published-only',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'oneshowlearn-public-seo-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(directory,'isolated.db'),
    UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'public-seo-fixture-only',
    PAYMENT_CONFIG_ENCRYPTION_KEY:'',MINERU_API_KEY:'',AI_ENABLED:'false'});
  const {db,run,row}=await import('../server/db.mjs');
  const {SITE_DEFAULTS}=await import('../server/site-defaults.mjs');
  const {loadPublicSeoData,listPublicSeoCourses,publicSeoImage}=await import('../server/public-seo-data.mjs');
  let closed=false;
  t.after(()=>{if(!closed)db.close();rmSync(directory,{recursive:true,force:true});});
  const add=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
  const livePath=add("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','公开路径','published')");
  const hiddenPath=add("INSERT INTO learning_paths(slug,title,status) VALUES('hidden-path','HIDDEN_PATH','draft')");
  const pack=(slug,parent=livePath,state='published',cover='/assets/public-cover.webp')=>add(
    'INSERT INTO project_packs(path_id,slug,title,subtitle,description,deliverable,cover_url,price_cents,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [parent,slug,'课程 '+slug,'公开课程副标题','公开课程介绍','公开实践方向',cover,49900,state,'2026-10-01T00:00:00Z']);
  const course=pack('public-course'),second=pack('other-course',livePath,'published','https://images.example.com/course.webp');
  const draftCourse=pack('draft-course',livePath,'draft'),hiddenCourse=pack('hidden-parent-course',hiddenPath);
  const archivedCourse=pack('archived-course',livePath,'archived');
  pack('Legacy Invalid Slug');
  const product=add("INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,'PUBLIC-SEO-PRODUCT','真实公开商品',49900,'active')",[course]);
  const chapter=add("INSERT INTO project_steps(pack_id,title,summary,status) VALUES(?,'公开章节','公开章节简介','published')",[course]);
  const hiddenChapter=add("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'HIDDEN_CHAPTER','draft')",[course]);
  const parentHiddenChapter=add("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'HIDDEN_PARENT_CHAPTER','published')",[hiddenCourse]);
  run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,2)',[chapter]);
  const paidItem=add("INSERT INTO content_items(step_id,title,type,body,resource_url,is_preview,status) VALUES(?,'公开付费资料标题','document','PAID_BODY_SECRET','/api/materials/987?ticket=ATTACHMENT_SECRET',0,'published')",[chapter]);
  const previewItem=add("INSERT INTO content_items(step_id,title,type,body,is_preview,status) VALUES(?,'公开试看资料标题','document','PREVIEW_BODY_NOT_A_SEARCH_DOCUMENT',1,'published')",[chapter]);
  add("INSERT INTO content_items(step_id,title,type,body,is_preview,status) VALUES(?,'DRAFT_CONTENT_TITLE','document','DRAFT_BODY_SECRET',1,'draft')",[chapter]);
  const hiddenLibrary=add("INSERT INTO content_library(title,type,body,status) VALUES('ARCHIVED_LIBRARY_TITLE','document','ARCHIVED_LIBRARY_BODY','archived')");
  add("INSERT INTO content_items(step_id,title,type,body,library_id,is_preview,status) VALUES(?,'ARCHIVED_LIBRARY_TITLE','document','ARCHIVED_LIBRARY_BODY',?,1,'published')",[chapter,hiddenLibrary]);
  const makeLesson=(title,chapterId,preview=false,state='published',placementState='published',demo=false)=>{
    const id=add('INSERT INTO learning_lessons(title,subtitle,config,status) VALUES(?,?,?,?)',
      [title,'公开课时副标题',JSON.stringify({isDemoMedia:demo,durationSeconds:120,videoAssetId:987,
        slides:[{text:'PRIVATE_TRANSCRIPT_SECRET',assetId:988}],operations:[{body:'PRIVATE_OPERATION_SECRET'}]}),state]);
    return add('INSERT INTO lesson_placements(lesson_id,chapter_id,is_preview,status) VALUES(?,?,?,?)',[id,chapterId,Number(preview),placementState]);
  };
  const previewLesson=makeLesson('公开演示试看课时',chapter,true,'published','published',true);
  const paidLesson=makeLesson('公开付费课时标题',chapter);
  makeLesson('DRAFT_LESSON_TITLE',chapter,false,'draft');
  makeLesson('DRAFT_PLACEMENT_TITLE',chapter,false,'published','draft');
  makeLesson('HIDDEN_CHAPTER_LESSON',hiddenChapter,true);
  makeLesson('HIDDEN_PARENT_LESSON',parentHiddenChapter,true);
  run('INSERT INTO learning_entry_settings(id,course_id) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id',[course]);
  const user=add("INSERT INTO users(email,password_hash,name,role) VALUES('seo-private@example.invalid','PRIVATE_PASSWORD_HASH','PRIVATE_USER_NAME','admin')");
  run("INSERT INTO entitlements(user_id,pack_id,status) VALUES(?,?,'active')",[user,course]);
  run("INSERT INTO progress(user_id,content_item_id,status) VALUES(?,?,'completed')",[user,paidItem]);
  run('INSERT INTO learning_progress(user_id,placement_id,video_time,tasks) VALUES(?,?,120,?)',[user,paidLesson,'["PRIVATE_CHECKLIST_SECRET"]']);
  const project=add("INSERT INTO practice_projects(slug,title,description,cover_url,tags,status) VALUES('public-project','公开实战项目','公开项目简介','/api/materials/988',?,'published')",['["公开标签"]']);
  run('INSERT INTO practice_project_courses(project_id,pack_id) VALUES(?,?)',[project,course]);
  const hiddenProject=add("INSERT INTO practice_projects(slug,title,status) VALUES('hidden-project','HIDDEN_PROJECT','published')");
  run('INSERT INTO practice_project_courses(project_id,pack_id) VALUES(?,?)',[hiddenProject,hiddenCourse]);
  const draftProject=add("INSERT INTO practice_projects(slug,title,status) VALUES('draft-project','DRAFT_PROJECT','draft')");
  run('INSERT INTO practice_project_courses(project_id,pack_id) VALUES(?,?)',[draftProject,course]);
  const published={...SITE_DEFAULTS.public,title:'CMS 公开标题',description:'CMS 公开介绍',
    courseIds:[course,draftCourse,hiddenCourse],projectIds:[project,hiddenProject,draftProject],
    image:'https://images.example.com/hero.webp?token=SIGNED_IMAGE_SECRET',privateExtra:'CMS_EXTRA_SECRET',
    hotCourseCards:[{tag:'公开标签',title:'公开卡片',description:'公开卡片介绍',image:'/assets/card.webp',courseId:course},
      {tag:'隐藏关联',title:'公开描述卡',description:'公开描述',image:'/api/materials/987',courseId:draftCourse}]};
  run('INSERT INTO site_pages(key,draft_json,published_json) VALUES(?,?,?)',
    ['public',JSON.stringify({...published,title:'DRAFT_CMS_SECRET'}),JSON.stringify(published)]);
  const settings={productId:product,priceCents:49900,originalPriceCents:499900,
    publicOrigin:'https://merchant-origin.example.invalid',
    wechat:{enabled:true,appId:'PRIVATE_MERCHANT_ID',publicKey:'PRIVATE_PROVIDER_PUBLIC_KEY'},alipay:{enabled:false}};
  // Invalid cipher and no encryption key prove public rendering never decrypts
  // payment credentials. This fixture is not a payment/provider probe.
  run('INSERT INTO payment_configuration(version,settings,secrets_cipher,actor_id) VALUES(1,?,?,?)',
    [JSON.stringify(settings),'UNREADABLE_PRIVATE_CIPHER',user]);
  const snapshot=()=>{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const values=tables.map(({name})=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()]);
    return createHash('sha256').update(JSON.stringify(values)).digest('hex');
  };
  const before=snapshot();
  const nativePrepare=db.prepare.bind(db),sql=[];
  db.prepare=statement=>{sql.push(statement);return nativePrepare(statement);};
  const initial=loadPublicSeoData({kind:'home'});
  db.prepare=nativePrepare;

  await t.test('published CMS is used without drafts or unrecognized payload keys',()=>{
    assert.equal(initial.site.title,'CMS 公开标题');
    assert.equal(initial.site.image,'');assert.equal(Object.hasOwn(initial.site,'privateExtra'),false);
    assert.deepEqual(initial.site.courseIds,[course]);assert.deepEqual(initial.site.projectIds,[project]);
    assert.equal(initial.site.projects[0].cover_url,'');
    assert.equal(initial.site.projects[0].courses[0].slug,'public-course');
    assert.equal(initial.site.hotCourseCards[0].course.slug,'public-course');
    assert.equal(initial.site.hotCourseCards[1].course,null);assert.equal(initial.site.hotCourseCards[1].courseId,null);
    assert.equal(initial.site.hotCourseCards[1].image,'');
  });
  await t.test('public offer uses current authoritative amounts without any credential reader',()=>{
    assert.deepEqual(initial.offer,{productId:product,slug:'public-course',priceCents:49900,
      originalPriceCents:499900,includesPublishedProjects:true,
      channels:[{id:'wechat',label:'微信支付',available:true},{id:'alipay',label:'支付宝',available:false}]});
    assert.ok(sql.every(statement=>/^\s*SELECT\b/i.test(statement)));
    assert.ok(!sql.some(statement=>/secrets_cipher|masterKey|users|entitlements|\bprogress\b|learning_progress|learning_notes|community_records|\borders\b/i.test(statement)));
    assert.ok(!sql.some(statement=>/SELECT\s+\*/i.test(statement)));
    assert.ok(!sql.some(statement=>/\bl\.config\b/.test(statement)&&!/json_extract\(l\.config/.test(statement)));
    assert.equal(row('SELECT COUNT(*) n FROM payment_checkouts').n,0);
  });
  await t.test('home metadata only includes published parent chains and anonymous preview access',()=>{
    assert.deepEqual(initial.entry.courses.map(course=>course.slug),['public-course','other-course']);
    assert.deepEqual(initial.entry.chapters.map(chapter=>chapter.id),[chapter]);
    assert.deepEqual(initial.entry.lessons.map(lesson=>lesson.id),[previewLesson,paidLesson]);
    assert.equal(initial.entry.lessons[0].locked,false);assert.equal(initial.entry.lessons[1].locked,true);
    assert.equal(initial.entry.lessons[0].is_demo_media,true);assert.equal(initial.entry.lessons[0].duration_seconds,120);
    assert.equal(initial.entry.defaultCourseId,course);
  });
  await t.test('course curriculum exposes names and flags, never bodies or private media',()=>{
    const data=loadPublicSeoData({kind:'course',slug:'public-course'});
    assert.equal(data.course.pack.entitled,false);assert.equal(data.course.pack.product_id,product);
    assert.deepEqual(data.course.pack.steps[0].contents.map(item=>item.id),[paidItem,previewItem]);
    assert.deepEqual(Object.keys(data.course.pack.steps[0].contents[0]).sort(),['id','is_preview','locked','title','type']);
    assert.deepEqual(data.course.lessons.map(lesson=>lesson.id),[previewLesson,paidLesson]);
    assert.equal(data.slug,'public-course');assert.equal(data.catalog.length,2);
  });
  await t.test('no private marker, record, progress, config, transcript or signed attachment is serialized',()=>{
    for(const descriptor of [{kind:'home'},{kind:'course',slug:'public-course'}]){
      const json=JSON.stringify(loadPublicSeoData(descriptor));
      for(const marker of ['SECRET','PRIVATE_','DRAFT_','HIDDEN_','ARCHIVED_','UNREADABLE_PRIVATE_CIPHER','merchant-origin'])assert.equal(json.includes(marker),false);
      for(const key of ['"config":','"body":','"resource_url":','"progress":','"user":','"email":','"secrets":','"entitlements":'])assert.equal(json.includes(key),false);
    }
  });
  await t.test('request-like identity input cannot upgrade anonymous curriculum rights',()=>{
    const injected=loadPublicSeoData({kind:'home',user:{id:user,role:'admin'},headers:{authorization:'PRIVATE_AUTHORIZATION'},cookie:'PRIVATE_COOKIE'});
    assert.deepEqual(injected,initial);
  });
  await t.test('default course follows offer and then published selected course without key or provider access',()=>{
    assert.equal(loadPublicSeoData({kind:'course',slug:null}).slug,'public-course');
    run('UPDATE payment_configuration SET settings=? WHERE version=1',[JSON.stringify({...settings,productId:null})]);
    assert.equal(loadPublicSeoData({kind:'course',slug:null}).slug,'public-course');
    run('UPDATE learning_entry_settings SET course_id=? WHERE id=1',[hiddenCourse]);
    assert.equal(loadPublicSeoData({kind:'course',slug:null}).slug,'public-course');
    run('UPDATE payment_configuration SET settings=? WHERE version=1',[JSON.stringify(settings)]);
    run('UPDATE learning_entry_settings SET course_id=? WHERE id=1',[course]);
  });
  await t.test('dynamic amounts are returned after a pricing change with no fixed marketing price',()=>{
    const changed={...settings,priceCents:29900,originalPriceCents:199900};
    run('UPDATE products SET price_cents=29900 WHERE id=?',[product]);
    run('UPDATE payment_configuration SET settings=? WHERE version=1',[JSON.stringify(changed)]);
    const data=loadPublicSeoData({kind:'home'});assert.equal(data.offer.priceCents,29900);assert.equal(data.offer.originalPriceCents,199900);
    run('UPDATE products SET price_cents=49900 WHERE id=?',[product]);
    run('UPDATE payment_configuration SET settings=? WHERE version=1',[JSON.stringify(settings)]);
  });
  await t.test('missing, malformed, draft, archived and unpublished-parent courses are 404',()=>{
    for(const slug of ['missing-course','draft-course','archived-course','hidden-parent-course','../private','',123,'x'.repeat(101)])
      assert.throws(()=>loadPublicSeoData({kind:'course',slug}),error=>error.status===404);
    for(const descriptor of [null,{kind:'private'},{kind:'legal'}])assert.throws(()=>loadPublicSeoData(descriptor),error=>error.status===404);
  });
  await t.test('sitemap data lists only exact published courses and recorded dates',()=>{
    assert.deepEqual(listPublicSeoCourses(),[{slug:'public-course',name:'课程 public-course',updatedAt:'2026-10-01T00:00:00Z'},
      {slug:'other-course',name:'课程 other-course',updatedAt:'2026-10-01T00:00:00Z'}]);
  });
  await t.test('public image projection rejects private, signed, executable and ambiguous URLs',()=>{
    for(const url of ['/api/materials/1','/uploads/image.webp','/assets/../private.webp','/assets/photo.webp?ticket=SECRET',
      'javascript:alert(1)','http://images.example.com/photo.webp','https://user:pass@images.example.com/photo.webp',
      'https://images.example.com/photo.webp?signature=SECRET','https://images.example.com/photo.webp#SECRET',
      'https://images.example.com/api/materials/photo.webp','https://images.example.com/%61pi/materials/photo.webp',
      'https://127.0.0.1/image.webp','https://localhost/image.webp','https://[::1]/image.webp','https://images.example.com/photo.html'])
      assert.equal(publicSeoImage(url),'');
    assert.equal(publicSeoImage('/assets/public-cover.webp'),'/assets/public-cover.webp');
    assert.equal(publicSeoImage('https://images.example.com/course.webp'),'https://images.example.com/course.webp');
  });
  await t.test('repeated loading leaves every schema table value unchanged',()=>{
    assert.equal(snapshot(),before);
    for(let count=0;count<3;count++){loadPublicSeoData({kind:'home'});loadPublicSeoData({kind:'course',slug:'other-course'});listPublicSeoCourses();}
    assert.equal(snapshot(),before);
  });
  await t.test('database failure propagates instead of becoming a false missing-page response',()=>{
    db.close();closed=true;
    assert.throws(()=>loadPublicSeoData({kind:'home'}),error=>error.status!==404);
    assert.throws(()=>listPublicSeoCourses(),error=>error.status!==404);
  });
});
