export const defaultConfig = {
    enableWorker: true,
    enableStashBuffer: true,
    stashInitialSize: undefined,

    isLive: false,

    lazyLoad: true,
    lazyLoadMaxDuration: 3 * 60,

    statisticsInfoReportInterval: 600,

    seekType: 'range',  // [range, param, custom]
    seekParamStart: 'bstart',
    seekParamEnd: 'bend',
    customSeekHandler: undefined
};

export function createDefaultConfig() {
    return Object.assign({}, defaultConfig);
}