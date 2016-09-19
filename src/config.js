export const defaultConfig = {
    enableWorker: false,
    enableStashBuffer: true,
    stashInitialSize: undefined,

    isLive: false,

    lazyLoad: true,
    lazyLoadMaxDuration: 3 * 60,
    deferLoadAfterSourceOpen: true,

    statisticsInfoReportInterval: 600,

    accurateSeek: false,
    seekType: 'range',  // [range, param, custom]
    seekParamStart: 'bstart',
    seekParamEnd: 'bend',
    customSeekHandler: undefined
};

export function createDefaultConfig() {
    return Object.assign({}, defaultConfig);
}