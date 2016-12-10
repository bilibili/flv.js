/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class ParamSeekHandler {

    constructor(paramStart, paramEnd) {
        this._startName = paramStart;
        this._endName = paramEnd;
    }

    getConfig(baseUrl, range) {
        let url = baseUrl;

        if (range.from !== 0 || range.to !== -1) {
            let needAnd = true;
            if (url.indexOf('?') === -1) {
                url += '?';
                needAnd = false;
            }

            if (needAnd) {
                url += '&';
            }

            url += `${this._startName}=${range.from.toString()}`;

            if (range.to !== -1) {
                url += `&${this._endName}=${range.to.toString()}`;
            }
        }

        return {
            url: url,
            headers: {}
        };
    }

    removeURLParameters(seekedURL) {
        let baseURL = seekedURL.split('?')[0];
        let params = undefined;

        let queryIndex = seekedURL.indexOf('?');
        if (queryIndex !== -1) {
            params = seekedURL.substring(queryIndex + 1);
        }

        let resultParams = '';

        if (params != undefined && params.length > 0) {
            let pairs = params.split('&');

            for (let i = 0; i < pairs.length; i++) {
                let pair = pairs[i].split('=');
                let requireAnd = (i > 0);

                if (pair[0] !== this._startName && pair[0] !== this._endName) {
                    if (requireAnd) {
                        resultParams += '&';
                    }
                    resultParams += pairs[i];
                }
            }
        }

        return (resultParams.length === 0) ? baseURL : baseURL + '?' + resultParams;
    }

}

export default ParamSeekHandler;