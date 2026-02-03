import {
  readDemoServerInfo,
  removeDemoServerInfo,
  stopDemoServer,
} from "./demo-server";

export default async function globalTeardown() {
  try {
    const info = await readDemoServerInfo();
    await stopDemoServer(info);
  } finally {
    await removeDemoServerInfo();
  }
}

