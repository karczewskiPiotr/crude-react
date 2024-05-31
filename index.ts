const server = Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname;

    if (path === "/") {
      return new Response(Bun.file("./index.html"), {
        headers: { "content-type": "text/html" },
      });
    }

    if (path === "/index.js") {
      return new Response(Bun.file("./out/index.js"), {
        headers: { "content-type": "application/javascript" },
      });
    }

    return Response.redirect("/", 301);
  },
});

console.log(`Listening on ${server.url}`);
