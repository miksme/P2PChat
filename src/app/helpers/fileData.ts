export class FileData {
  constructor (public FileID: string, public FileSize: number, public FileName: string) {
    this.FileName = this.FileName.length > 100 ? this.FileName.substring(0, 100) : this.FileName
  }

  public equals (obj: FileData):boolean {
    if (this.FileSize !== obj.FileSize || this.FileID !== obj.FileID || this.FileName !== obj.FileName) {
      return false
    } return true
  }
}
