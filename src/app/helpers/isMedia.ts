export class isMedia {
  private static _match = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#%?=~_|!:,.;]*[-A-Z0-9+&@#%=~_|])/gim// (\w+(:\/{1})\w+)/gim;//(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
  private static imgTypes = ['.jpg', '.jpeg', '.png', '.gif']
  private static vidTypes = ['.mp4', '.webm', '.ogv']
  private static audTypes = ['.mp3', '.wav', '.oga', '.weba']

  public static getLinks (str: string) {
    return str.match(isMedia._match)
  }

  public static isMedia (str:string) {
    const a = str.toLowerCase()
    return isMedia.isImage(a) || isMedia.isVideo(a) || isMedia.isAudio(a)
  }

  /**
   * Assumes that the type at the of of file name corresponds to actual file type and uses it to get the MIME type
   * @param str File name
   * @returns The theoretical MIME type
   */
  public static getMIME (str:string) {
    const enda = str.toLowerCase().split('.')
    const end = enda[enda.length - 1]
    switch (end) {
      // Images
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'gif':
        return 'image/gif'
      // Videos
      case 'mp4':
        return 'video/mp4'
      case 'webm':
        return 'video/webm'
      case 'ogv':
        return 'video/ogg'
      // Audio
      case 'mp3':
        return 'audio/mpeg'
      case 'wav':
        return 'audio/wav'
      case 'oga':
        return 'audio/ogg'
      case 'weba':
        return 'audio/webm'
    }
    return ''
  }

  public static isImage (str: string):boolean {
    for (let i = 0; i < isMedia.imgTypes.length; i++) {
      if (str.endsWith(isMedia.imgTypes[i])) { return true }
    } return false
  }

  public static isVideo (str: string):boolean {
    for (let i = 0; i < isMedia.vidTypes.length; i++) {
      if (str.endsWith(isMedia.vidTypes[i])) { return true }
    } return false
  }

  public static isAudio (str: string):boolean {
    for (let i = 0; i < isMedia.audTypes.length; i++) {
      if (str.endsWith(isMedia.audTypes[i])) { return true }
    } return false
  }
}
