// flv.js TypeScript definition file

declare namespace FlvJs {

    interface MediaSegment {
        duration: number,
        filesize?: number,
        url: string
    }

    interface MediaDataSource {
        type: string,
        isLive?: boolean,
        cors?: boolean,
        withCredentials?: boolean,

        duration?: number;
        filesize?: number;
        url?: string;

        segments?: Array<MediaSegment>
    }

    interface Config {
        enableWorker?: boolean,
        enableStashBuffer?: boolean,
        stashInitialSize?: number,

        isLive?: boolean,

        lazyLoad?: boolean,
        lazyLoadMaxDuration?: number,
        deferLoadAfterSourceOpen?: boolean,

        statisticsInfoReportInterval?: number,

        accurateSeek?: boolean,
        seekType?: string,  // [range, param, custom]
        seekParamStart?: string,
        seekParamEnd?: string,
        rangeLoadZeroStart?: boolean,
        customSeekHandler?: any
    }

    interface FeatureList {
        mseFlvPlayback: boolean,
        mseLiveFlvPlayback: boolean,
        networkStreamIO: boolean,
        networkLoaderName: string,
        nativeMP4H264Playback: boolean,
        nativeWebmVP8Playback: boolean,
        nativeWebmVP9Playback: boolean
    }

    interface PlayerConstructor {
        new (mediaDataSource: MediaDataSource, config?: Config): Player;
    }

    interface Player {
        constructor: PlayerConstructor;
        destroy(): void;
        on(event: string, listener: Function): void;
        off(event: string, listener: Function): void;
        attachMediaElement(mediaElement: HTMLMediaElement): void;
        detachMediaElement(): void;
        load(): void;
        unload(): void;
        play(): void;
        pause(): void;
        buffered: TimeRanges;
        duration: number;
        volume: number;
        muted: boolean;
        currentTime: number;
        mediaInfo: Object;
        statisticsInfo: Object;
    }

    interface FlvPlayer extends Player {
    }

    interface NativePlayer extends Player {
    }

    interface LoggingControl {
        forceGlobalTag: boolean,
        globalTag: string,
        enableAll: boolean,
        enableDebug: boolean,
        enableVerbose: boolean,
        enableInfo: boolean,
        enableWarn: boolean,
        enableError: boolean,
        getConfig: Object,
        applyConfig: Object,
    }

    interface Events {
        ERROR: string,
        LOADING_COMPLETE: string,
        RECOVERED_EARLY_EOF: string,
        MEDIA_INFO: string,
        STATISTICS_INFO: string
    }

    interface ErrorTypes {
        NETWORK_ERROR: string,
        MEDIA_ERROR: string,
        OTHER_ERROR: string
    }

    interface ErrorDetails {
        NETWORK_EXCEPTION: string,
        NETWORK_STATUS_CODE_INVALID: string,
        NETWORK_TIMEOUT: string,
        NETWORK_UNRECOVERABLE_EARLY_EOF: string,

        MEDIA_MSE_ERROR: string,

        MEDIA_FORMAT_ERROR: string,
        MEDIA_FORMAT_UNSUPPORTED: string,
        MEDIA_CODEC_UNSUPPORTED: string
    }

}

declare var flvjs: {
    createPlayer(mediaDataSource: FlvJs.MediaDataSource, config?: FlvJs.Config): FlvJs.Player,
    isSupported(): boolean,
    getFeatureList(): FlvJs.FeatureList,

    Events: FlvJs.Events,
    ErrorTypes: FlvJs.ErrorTypes,
    ErrorDetails: FlvJs.ErrorDetails,

    FlvPlayer: FlvJs.PlayerConstructor,
    NativePlayer: FlvJs.PlayerConstructor,
    LoggingControl: FlvJs.LoggingControl
};