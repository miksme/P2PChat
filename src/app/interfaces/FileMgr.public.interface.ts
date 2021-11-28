import { FileData } from '../helpers/fileData'
import { WritableStreamForImagesAndStuff } from './../roomControl/file-management/downloadToDisplay'
import { FileDownloadState } from './../roomControl/file-management/fileDownloadState'
export interface FileMgrPublicInterface {

  /**
   * Returns data about local file
   * @param FileID ID of the file
   */
  getLocalFile(FileID: string): FileData|undefined
  /**
   * Returns data about remote file
   * @param UserID Remote user
   * @param FileID File ID
   */
  getRemoteFile(UserID: string, FileID: string): FileData|undefined
  /**
   * Returns a list of all files remote user is providing
   * @param UserID REmote user to get files from
   */
  getRemoteFileList(UserID: string): FileData[]
  /**
   * Returns list of all user provided files
   */
  getLocalFileList(): FileData[]
  /**
   * Adds a local file to the list
   * @param file File to add to list
   */
  addLocalFile(file: File): FileData
  /**
   * Removes a local file from the list
   * @param FileID File to remove from the list
   */
  removeLocalFile(FileID: string): void
  /**
   * Attempts to download the remote file
   * @param UserID Remote user
   * @param FileID Remote file ID
   * @param writableStream Where to write data
   */
  downloadFile(UserID: string, FileID: string, writableStream:WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff): undefined|FileDownloadState
}
