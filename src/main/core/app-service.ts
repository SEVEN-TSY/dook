import type { CoreProbe, StorageProbe } from '../../shared/contracts'

export interface StorageDiagnostics {
  probe: () => StorageProbe
}

/** IPC与MCP共用的应用入口。当前仅提供基础诊断，尚未实现Todo业务。 */
export class AppService {
  constructor(private readonly storage: StorageDiagnostics) {}

  probe(): CoreProbe {
    return {
      service: 'mytodo-core',
      checkedAt: new Date().toISOString(),
      storage: this.storage.probe()
    }
  }
}
