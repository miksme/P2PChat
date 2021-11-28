/**
 * Stream event "encoder"
 */
export class EncodeStreamEvents {
  public static newUser (userID: string) {
    return userID
  }

  public static lostUser (userID: string) {
    return userID
  }

  public static updatedStreamInfo (userID: string, possibilities: Set<string>, primaryStream: string|undefined) {
    return { userID: userID, possibilities: possibilities, primaryStream: primaryStream }
  }

  public static lostStream (userID: string, streamID: string) {
    return { userID: userID, streamID: streamID }
  }

  public static gainedStream (userID: string, stream: MediaStream) {
    return { userID: userID, stream: stream }
  }
}
/**
 * Stream event "decoder"
 */
export class DecodeStreamEvents {
  public static newUser (data: any):string {
    return data
  }

  public static lostUser (data: any):string {
    return data
  }

  public static updatedStreamInfo (data: any):{userID: string, possibilities: Set<string>, primaryStream: string|undefined} {
    return data
  }

  public static lostStream (data: any):{userID: string, streamID: string} {
    return data
  }

  public static gainedStream (data: any):{userID: string, stream: MediaStream} {
    return data
  }
}
