export const defaultConfig = {
    enableWorker: true,
    enableStashBuffer: true,

    isLive: false,

    lazyLoad: true,
    lazyLoadMaxDuration: 3 * 60,

    seekType: 'range',  // [range, param, custom]
    seekParamStart: 'bstart',
    seekParamEnd: 'bend',
    customSeekHandler: undefined
};

export function createDefaultConfig() {
    return Object.assign({}, defaultConfig);
}