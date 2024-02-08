/*
 * Copyright (C) 2022 もにょてっく. All Rights Reserved.
 *
 * @author もにょ〜ん <monyone.teihen@gmail.com>
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

import ExpGolomb from './exp-golomb.js';

// type OperatingPoint = {
//     operating_point_idc: number,
//     level: number,
//     tier: number,
// };

class AV1OBUParser {

    static parseOBUs(uint8array) {
        let meta = null;
        for (let i = 0; i < uint8array.byteLength; ) {
            let forbidden_bit = (uint8array[i] & 0x80) >> 7;
            let type = (uint8array[i] & 0x78) >> 3;
            let extension_flag = (uint8array[i] & 0x04) !== 0;
            let has_size_field = (uint8array[i] & 0x02) !== 0;
            let reserved_1bit = (uint8array[i] & 0x01) !== 0;

            i += 1;
            if (extension_flag) { i += 1; }

            let size = Number.POSITIVE_INFINITY;
            if (has_size_field) {
                size = 0;
                for (let j = 0; ; j++) {
                    size |= (uint8array[i] & 0x7F) << (j * 7);
                    i += 1;
                    if ((uint8array[i] & 0x80) === 0) { break; }
                }
            }
            if (type === 1) { // OBU_SEQUENCE_HEADER
                meta = AV1OBUParser.parseSeuqneceHeader(uint8array.subarray(i, i + size));
            }

            i += size;
        }

        return meta;
    }

    static parseSeuqneceHeader(uint8array) {
        let gb = new ExpGolomb(uint8array);

        let seq_profile = gb.readBits(3);
        let still_picture = gb.readBool();
        let reduced_still_picture_header = gb.readBool();

        let fps = 0, fps_fixed = true, fps_num = 0, fps_den = 0;
        let operating_points/*: OperatingPoint[]*/ = [];
        if (reduced_still_picture_header) {
            operating_points.push({
                operating_point_idc: 0,
                level: gb.readBits(5),
                tier: 0,
            });
        } else {
            let timing_info_present_flag = gb.readBool();
            let decoder_model_info_present_flag = false;
            let buffer_delay_length_minus_1 = 0;
            if (timing_info_present_flag) {
                // timing_info
                let num_units_in_display_tick = gb.readBits(32);
                let time_scale = gb.readBits(32);
                let equal_picture_interval = gb.readBool();
                let num_ticks_per_picture_minus_1 = 0;
                if (equal_picture_interval) {
                    let leading = 0;
                    while (true) {
                        let value = gb.readBits(1);
                        if (value !== 0) { break; }
                        leading += 1;
                    }
                    if (leading >= 32) {
                        num_ticks_per_picture_minus_1 = 0xFFFFFFFF;
                    } else {
                        num_ticks_per_picture_minus_1 = ((1 << leading) - 1) + gb.readBits(leading);
                    }
                }
                fps_den = num_units_in_display_tick;
                fps_num = time_scale;
                fps = fps_num / fps_den;
                fps_fixed = equal_picture_interval;

                let decoder_model_info_present_flag = gb.readBool();
                if (decoder_model_info_present_flag) {
                    // decoder_model_info
                    buffer_delay_length_minus_1 = gb.readBits(5);
                    let num_units_in_decoding_tick = gb.readBits(32);
                    let buffer_removal_time_length_minus_1 = gb.readBits(5);
                    let frame_presentation_time_length_minus_1 = gb.readBits(5);
                }
            }

            let initial_display_delay_present_flag = gb.readBool();
            let operating_points_cnt_minus_1 = gb.readBits(5);
            for (let i = 0; i <= operating_points_cnt_minus_1; i++) {
                let operating_point_idc = gb.readBits(12);
                let level = gb.readBits(5);
                let tier = level > 7 ? gb.readBits(1) : 0;

                operating_points.push({
                    operating_point_idc,
                    level,
                    tier
                });

                if (decoder_model_info_present_flag) {
                    let decoder_model_present_for_this_op = gb.readBool();
                    if (decoder_model_present_for_this_op) {
                        // operating_parameters_info
                        let decoder_buffer_delay = gb.readBits(buffer_delay_length_minus_1 + 1);
                        let encoder_buffer_delay = gb.readBits(buffer_delay_length_minus_1 + 1);
                        let low_delay_mode_flag = gb.readBool();
                    }
                }

                if (initial_display_delay_present_flag) {
                    let initial_display_delay_present_for_this_op = gb.readBool();
                    if (initial_display_delay_present_for_this_op) {
                        let initial_display_delay_minus_1 = gb.readBits(4);
                    }
                }
            }
        }

        let operating_point = 0;
        let { level, tier } = operating_points[operating_point];

        let frame_width_bits_minus_1 = gb.readBits(4);
        let frame_height_bits_minus_1 = gb.readBits(4);

        let max_frame_width = gb.readBits(frame_width_bits_minus_1 + 1) + 1;
        let max_frame_height = gb.readBits(frame_height_bits_minus_1 + 1) + 1;

        let frame_id_numbers_present_flag = false;
        if (!reduced_still_picture_header) {
            frame_id_numbers_present_flag = gb.readBool();
        }
        if (frame_id_numbers_present_flag) {
            let delta_frame_id_length_minus_2 = gb.readBits(4);
            let additional_frame_id_length_minus_1 = gb.readBits(4);
        }

        let SELECT_SCREEN_CONTENT_TOOLS = 2;
        let SELECT_INTEGER_MV = 2;

        let use_128x128_superblock = gb.readBool();
        let enable_filter_intra = gb.readBool();
        let enable_intra_edge_filter = gb.readBool();
        let enable_interintra_compound = false;
        let enable_masked_compound = false;
        let enable_warped_motion = false;
        let enable_dual_filter = false;
        let enable_order_hint = false;
        let enable_jnt_comp = false;
        let enable_ref_frame_mvs = false;
        let seq_force_screen_content_tools = SELECT_SCREEN_CONTENT_TOOLS;
        let seq_force_integer_mv = SELECT_INTEGER_MV;
        let OrderHintBits = 0;
        if (!reduced_still_picture_header) {
            enable_interintra_compound = gb.readBool();
            enable_masked_compound = gb.readBool();
            enable_warped_motion = gb.readBool();
            enable_dual_filter = gb.readBool();
            enable_order_hint = gb.readBool();
            if (enable_order_hint) {
                let enable_jnt_comp = gb.readBool();
                let enable_ref_frame_mvs = gb.readBool();
            }
            let seq_choose_screen_content_tools = gb.readBool();
            if (seq_choose_screen_content_tools) {
                seq_force_screen_content_tools = SELECT_SCREEN_CONTENT_TOOLS;
            } else {
                seq_force_screen_content_tools = gb.readBits(1);
            }
            if (seq_force_screen_content_tools) {
                let seq_choose_integer_mv = gb.readBool();
                if (seq_choose_integer_mv) {
                    seq_force_integer_mv = SELECT_INTEGER_MV;
                } else {
                    seq_force_integer_mv = gb.readBits(1);
                }
            } else {
                seq_force_integer_mv = SELECT_INTEGER_MV;
            }
            if (enable_order_hint) {
                let order_hint_bits_minus_1 = gb.readBits(3);
                OrderHintBits = order_hint_bits_minus_1 + 1;
            } else {
                OrderHintBits = 0;
            }
        }

        let enable_superres = gb.readBool();
        let enable_cdef = gb.readBool();
        let enable_restoration = gb.readBool();
        // color_config
        let high_bitdepth = gb.readBool();
        let bitDepth = 8;
        if (seq_profile === 2 && high_bitdepth) {
            let twelve_bit = gb.readBool();
            bitDepth = twelve_bit ? 12 : 10;
        } else {
            bitDepth = high_bitdepth ? 10 : 8;
        }
        let mono_chrome = false;
        if (seq_profile !== 1) {
            mono_chrome = gb.readBool();
        }
        let numPlanes = mono_chrome ? 1 : 3;
        let color_description_present_flag = gb.readBool();
        let CP_BT_709 = 1, CP_UNSPECIFIED = 2;
        let TC_UNSPECIFIED = 2, TC_SRGB = 13;
        let MC_UNSPECIFIED = 2, MC_IDENTITY = 0;
        let color_primaries = CP_UNSPECIFIED;
        let transfer_characteristics = TC_UNSPECIFIED;
        let matrix_coefficients = MC_UNSPECIFIED;
        if (color_description_present_flag) {
            let color_primaries = gb.readBits(8);
            let transfer_characteristics = gb.readBits(8);
            let matrix_coefficients = gb.readBits(8);
        }
        let color_range = 1;
        let subsampling_x = 1
        let subsampling_y = 1;
        if (mono_chrome) {
            color_range = gb.readBits(1);
            subsampling_x = 1
            subsampling_y = 1;
            let chroma_sample_position = 0; /* CSP_UNKNOWN */
            let separate_uv_delta_q = 0
        } else {
            let color_range = 1;
            if (color_primaries === CP_BT_709 && transfer_characteristics === TC_SRGB && matrix_coefficients === MC_IDENTITY) {
                color_range = 1;
                subsampling_x = 1
                subsampling_y = 1
            } else {
                color_range = gb.readBits(1);
                if (seq_profile == 0) {
                    subsampling_x = 1
                    subsampling_y = 1
                } else if (seq_profile == 1) {
                    subsampling_x = 0
                    subsampling_y = 0
                } else {
                    if (bitDepth == 12) {
                        let subsampling_x = gb.readBits(1);
                        if (subsampling_x) {
                            let subsampling_y = gb.readBits(1);
                        } else {
                            let subsampling_y = 0;
                        }
                    } else {
                        subsampling_x = 1
                        subsampling_y = 0
                    }
                }
                if (subsampling_x && subsampling_y) {
                    let chroma_sample_position = gb.readBits(2)
                }
                let separate_uv_delta_q = gb.readBits(1);
            }
        }
        //
        let film_grain_params_present = gb.readBool();

        gb.destroy();
        gb = null;

        let codec_mimetype = `av01.${seq_profile}.${AV1OBUParser.getLevelString(level, tier)}.${bitDepth.toString(10).padStart(2, '0')}`;
        let sar_width = 1, sar_height = 1, sar_scale = 1;

        return {
            codec_mimetype,
            level: level,
            tier: tier,
            level_string: AV1OBUParser.getLevelString(level, tier),
            profile_idc: seq_profile,
            profile_string: `${seq_profile}`,
            bit_depth: bitDepth,
            ref_frames: 1, // FIXME!!!
            chroma_format: AV1OBUParser.getChromaFormat(mono_chrome, subsampling_x, subsampling_y),
            chroma_format_string: AV1OBUParser.getChromaFormatString(mono_chrome, subsampling_x, subsampling_y),

            frame_rate: {
                fixed: fps_fixed,
                fps: fps_num / fps_den,
                fps_den: fps_den,
                fps_num: fps_num,
            },

            sar_ratio: {
                width: sar_width,
                height: sar_height
            },

            codec_size: {
                width: max_frame_width,
                height: max_frame_height
            },

            present_size: {
                width: max_frame_width * sar_scale,
                height: max_frame_height
            }
        };
    }

    static getLevelString(level/*: number*/, tier/*: number*/)/*: string*/ {
        return `${level.toString(10).padStart(2, '0')}${tier === 0 ? 'M' : 'H'}`;
    }

    static getChromaFormat(mono_chrome/*: boolean*/, subsampling_x/*: number*/, subsampling_y/*: number*/)/*: number*/ {
        if (mono_chrome) {
            return 0;
        } else if (subsampling_x === 0 && subsampling_y === 0) {
            return 3;
        } else if (subsampling_x === 1 && subsampling_y === 0) {
            return 2;
        } else if (subsampling_x === 1 && subsampling_y === 1) {
            return 1;
        } else {
            return Number.NaN;
        }
    }

    static getChromaFormatString(mono_chrome/*: boolean*/, subsampling_x/*: number*/, subsampling_y/*: number*/)/*: string*/ {
        if (mono_chrome) {
            return '4:0:0';
        } else if (subsampling_x === 0 && subsampling_y === 0) {
            return '4:4:4';
        } else if (subsampling_x === 1 && subsampling_y === 0) {
            return '4:2:2';
        } else if (subsampling_x === 1 && subsampling_y === 1) {
            return '4:2:0';
        } else {
            return 'Unknown';
        }
    }
}

export default AV1OBUParser;