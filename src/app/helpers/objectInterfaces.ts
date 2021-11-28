export interface userInput {
    username: string,
    pfpLoc: string,

    showPFPs: boolean,
    displayLink: boolean,
    displayUserContent: boolean,
    autoDownloadUserContent: boolean,

    allowFileTransfer: boolean,
    maxActiveFileActions: number,
    fileTimeout: number,
    accelerateLargeFileTranfer: boolean,
    largeFileBoundary: number,
    peersPerLargeDownload:number,
    scalePeerAmount: boolean,

    useSTUN: boolean,
    useCustomSTUN: boolean,
    customSTUN: any,
    customSTUNurl: string,

    useTURN: boolean,
    useCustomTURN: boolean,
    customTURN: any,
    customTURNurl: string,
    customTURNuser: string,
    customTURNpwd: string,

    saveUserConfig: boolean
}
