import { createApp } from "../dist/app.js";

const app = await createApp();
await app.listen(0, "127.0.0.1");
process.send(await app.getUrl());
process.on("disconnect", () => app.close());
