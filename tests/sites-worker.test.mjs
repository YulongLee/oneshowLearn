import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("static previews retain known app navigation with noindex", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/notes?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.deepEqual(calls, ["/notes?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/api/missing", { headers: { accept: "text/html" } }),
    new Request("https://example.test/assets/missing.js", { headers: { accept: "text/html" } }),
    new Request("https://example.test/uploads/missing.html", { headers: { accept: "text/html" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/render/public-render.mjs", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
test('unknown page stays 404 and static crawler files fail closed',async()=>{
  const env={ASSETS:{fetch:async req=>new Response('shell',{status:new URL(req.url).pathname==='/index.html'?200:404})}};
  assert.equal((await worker.fetch(new Request('https://example.test/does-not-exist',{headers:{accept:'text/html'}}),env)).status,404);
  for(const path of ['/robots.txt','/sitemap.xml','/llms.txt'])assert.equal((await worker.fetch(new Request('https://example.test'+path,{headers:{accept:'text/html'}}),env)).status,503);
});
test('public binding strips identity and does not receive API/assets requests',async()=>{
  const calls=[],env={ASSETS:{fetch:async()=>new Response('asset')},PUBLIC_DOCUMENTS:{fetch:async req=>{calls.push(req);return new Response('public document');}}};
  const response=await worker.fetch(new Request('https://example.test/?utm_source=abc',{headers:{cookie:'private-cookie',authorization:'Bearer private'}}),env);
  assert.equal(await response.text(),'public document');assert.equal(calls[0].headers.get('cookie'),null);assert.equal(calls[0].headers.get('authorization'),null);
  await worker.fetch(new Request('https://example.test/api/missing'),env);await worker.fetch(new Request('https://example.test/assets/app.js'),env);assert.equal(calls.length,1);
});
