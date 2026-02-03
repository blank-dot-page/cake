import { startDemoServer } from "./demo-server";

export default async function globalSetup() {
  await startDemoServer();
}

