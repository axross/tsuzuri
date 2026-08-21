---
status: accepted
---

# Host on Vercel and split media transfer

Because media never goes to external storage, every uploaded and served byte
passes through our own server, which makes the hosting platform's request-body
ceiling a first-order architectural constraint rather than a detail. Vercel
Functions cap a request body at 4.5 MB, and it is an infrastructure limit that
no configuration setting raises. Cloudflare Workers allow 100 MB.

The research this project started from recommended Cloudflare Workers for
exactly that reason, and treated the platform choice as settled by it. We
chose Vercel with Next.js anyway, and accepted building a chunked media
transfer mechanism as the price.

The recommendation was overridden on grounds outside what that research
measured: the Next.js and Vercel pairing is the stack this project's author
works fastest in, and preview deployments, image handling, and the framework's
own caching primitives arrive without integration work. Those are not
capabilities Workers lacks; they are ones we would have had to assemble.

The consequence is a genuine, non-trivial obligation that no other decision
here imposes. A media object above the cap must be split by the client,
reassembled server-side, and committed as one blob — and the same split
applies on the way out. Note that the constraint binds the upload path at
least as hard as the download path, which is easy to get backwards: the cap is
on the request body, so committing media is where it is felt first. Base64
encoding inflates a payload by about a third, so the chunks must be sized
against encoded bytes rather than raw ones.

The alternative we rejected is worth recording precisely because it would have
made this obligation disappear: choosing Cloudflare Workers would have raised
the ceiling to 100 MB and removed the need for chunking entirely. If the
chunked transfer proves more expensive to build or operate than the framework
convenience is worth, that is the trade this decision made, and a later record
should supersede it rather than the mechanism being patched around.
