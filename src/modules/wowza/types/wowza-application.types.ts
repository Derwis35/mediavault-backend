export interface WowzaApplication {
  id: string;
  name: string;
  description: string;
  appType: string;
  streamConfig: {
    storageDir: string;
    streamType: string;
  };
}

export interface WowzaApplicationList {
  version: string;
  serverName: string;
  applications: WowzaApplication[];
}
