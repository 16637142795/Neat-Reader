interface WailsAPI {
  GetHealth(): Promise<string>;
  GetConfig(): Promise<{ Port: number }>;
  UploadFile(fileName: string, fileData: number[], accessToken: string): Promise<string>;
  VerifyToken(accessToken: string): Promise<string>;
  GetFileList(accessToken: string, dir: string, pageNum: number, pageSize: number, order: string, method: string, recursion: number): Promise<string>;
  SearchFiles(accessToken: string, key: string, dir: string, method: string, recursion: number): Promise<string>;
  GetTokenViaCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<string>;
  RefreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string>;
  GetTokenViaAlist(alistUrl: string, username: string, password: string): Promise<string>;
  OpenDirectory(): Promise<string>;
  ReadFile(path: string): Promise<number[]>;
  SelectFile(): Promise<string>;
}

declare global {
  interface Window {
    go: {
      main: {
        App: WailsAPI;
      };
    };
  }
}

export const wails = {
  initialized: false,
  init(): Promise<void> {
    return new Promise((resolve) => {
      if (this.initialized) {
        resolve();
        return;
      }

      const checkWails = setInterval(() => {
        if (window.go && window.go.main && window.go.main.App) {
          this.initialized = true;
          clearInterval(checkWails);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        if (!this.initialized) {
          clearInterval(checkWails);
          console.warn('Wails initialization timed out');
          resolve();
        }
      }, 10000);
    });
  },
  async call<T>(method: keyof WailsAPI, ...args: any[]): Promise<T> {
    if (!this.initialized) {
      await this.init();
    }

    if (!window.go || !window.go.main || !window.go.main.App) {
      throw new Error('Wails API not available');
    }

    const app = window.go.main.App;
    const func = app[method] as Function;
    const result = await func(...args);
    return result as T;
  },
  getHealth(): Promise<string> {
    return this.call<string>('GetHealth');
  },
  getConfig(): Promise<{ Port: number }> {
    return this.call<{ Port: number }>('GetConfig');
  },
  uploadFile(fileName: string, fileData: Uint8Array, accessToken: string): Promise<string> {
    return this.call<string>('UploadFile', fileName, Array.from(fileData), accessToken);
  },
  verifyToken(accessToken: string): Promise<string> {
    return this.call<string>('VerifyToken', accessToken);
  },
  getFileList(accessToken: string, dir: string, pageNum: number, pageSize: number, order: string, method: string, recursion: number): Promise<string> {
    return this.call<string>('GetFileList', accessToken, dir, pageNum, pageSize, order, method, recursion);
  },
  searchFiles(accessToken: string, key: string, dir: string, method: string, recursion: number): Promise<string> {
    return this.call<string>('SearchFiles', accessToken, key, dir, method, recursion);
  },
  getTokenViaCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<string> {
    return this.call<string>('GetTokenViaCode', code, clientId, clientSecret, redirectUri);
  },
  refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
    return this.call<string>('RefreshToken', refreshToken, clientId, clientSecret);
  },
  getTokenViaAlist(alistUrl: string, username: string, password: string): Promise<string> {
    return this.call<string>('GetTokenViaAlist', alistUrl, username, password);
  },
  openDirectory(): Promise<string> {
    return this.call<string>('OpenDirectory');
  },
  readFile(path: string): Promise<Uint8Array> {
    return this.call<number[]>('ReadFile', path).then(arr => new Uint8Array(arr));
  },
  selectFile(): Promise<string> {
    return this.call<string>('SelectFile');
  }
};
