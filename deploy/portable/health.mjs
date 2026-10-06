try {
  const response=await fetch('http://127.0.0.1:8787/api/ready',{signal:AbortSignal.timeout(2500)});
  if(!response.ok||(await response.json()).service!=='oneshowlearn-api')process.exit(1);
} catch {process.exit(1);}
