import { FileData } from './fileData'
export class JSONparse {
  public static destringify (data:string):any {
    return JSON.parse(data, JSONparse.JSONreviver)
  }

  public static stringify (data:any):string {
    return JSON.stringify(data, JSONparse.JSONreplacer)
  }

  /**
   * Allows to encode Sets, Maps, etc. in JSONs
   * @param key Key-Value pair key
   * @param value Key-Value pair value
   * @returns Encoded data
   */
  private static JSONreplacer (key:any, value:any) {
    if (value instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(value.entries())
      }
    } else if (value instanceof Set) {
      return {
        dataType: 'Set',
        value: [...value]
      }
    } else if (value instanceof Uint8Array) {
      return {
        dataType: 'Uint8Array',
        value: JSONparse.actualUint8ToString(value)
      }
    } else if (value instanceof FileData) {
      return {
        dataType: 'FileData',
        value: { FileID: value.FileID, FileName: value.FileName, FileSize: value.FileSize }
      }
    } else {
      return value
    }
  }

  /**
   * Gets back all the encoded data
   * @param key Key-Value pair key
   * @param value Key-Value pair value
   * @returns Decoded data
   */
  private static JSONreviver (key:any, value:any) {
    if (typeof value === 'object' && value !== null) {
      switch (value.dataType) {
        case 'Map':
          return new Map(value.value)
        case 'Set':
          return new Set(value.value)
        case 'Uint8Array':
          return JSONparse.actualStringToUint8(value.value)
        case 'FileData':
          return new FileData(value.value.FileID, value.value.FileSize, value.value.FileName)
      }
    }
    return value
  }

  /**
   * Converts Uint8Array to a string without trickshots that TextEncoder and others use that lead to data loss.
   * (why doesnt Uint8Array have a toString()? no clue).
   * Performance probably sucks
   * @param buf Uint8Array to encode
   * @returns Uint8Array as a string
   */
  private static actualUint8ToString (buf:Uint8Array) {
    const arr1 = new Array(Math.floor(buf.byteLength / 2) + buf.byteLength % 2)
    for (let i = 0; i < Math.floor(buf.byteLength / 2); i++) {
      arr1[i] = String.fromCharCode(((buf[i * 2] << 8) + buf[(i * 2) + 1]))
    }
    if (buf.byteLength % 2 !== 0) {
      arr1[arr1.length - 1] = String.fromCharCode(((buf[buf.length - 1] << 8)))
    }
    return arr1.join('')
  }

  /**
   * Converts a string to a Uint8Array
   * @param str String to convert
   * @returns Uint8Array
   */
  private static actualStringToUint8 (str:string) {
    const bufView = new Uint8Array(str.length * 2)
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      const num = str.charCodeAt(i)
      bufView[(2 * i)] = num >>> 8
      bufView[(2 * i) + 1] = num
    }
    return bufView
  }
}
