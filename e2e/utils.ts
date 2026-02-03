import { readDemoServerInfo } from "./demo-server";

export async function getDemoBaseURL(): Promise<string> {
  const info = await readDemoServerInfo();
  return info.baseURL;
}

