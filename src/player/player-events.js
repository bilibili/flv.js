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

const PlayerEvents = {
    ERROR: 'error',
    LOADING_COMPLETE: 'loading_complete',
    RECOVERED_EARLY_EOF: 'recovered_early_eof',
    MEDIA_INFO: 'media_info',
    METADATA_ARRIVED: 'metadata_arrived',
    SCRIPTDATA_ARRIVED: 'scriptdata_arrived',
    STATISTICS_INFO: 'statistics_info'
};

export default PlayerEvents;