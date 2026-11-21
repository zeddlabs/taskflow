import { createApp } from "../dist/app.js";

const app = await createApp();
await app.listen(process.send ? 0 : Number(process.env.PORT), "127.0.0.1");
process.send?.(await app.getUrl());
process.on("disconnect", () => app.close());
