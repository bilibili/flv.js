/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 * Copyright (C) 2022 Nanuns. All Rights Reserved.
 * 
 * @author zheng qian <xqq@xqq.im>
 * @author nanuns <support@nanuns.im>
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
import SPSParser from './sps-parser.js';

class HevcSPSParser {

    static parseSPS(uint8array) {
        let rbsp = SPSParser._ebsp2rbsp(uint8array);
        let gb = new ExpGolomb(rbsp);
        let hvcc = {};

        gb.readBits(16); // nal_unit_header
        gb.readBits(4);  // sps_video_parameter_set_id
        let max_sub_layers_minus1 = gb.readBits(3);  // sps_max_sub_layers_minus1
        gb.readBits(1);  // sps_temporal_id_nesting_flag

        HevcSPSParser._hvcc_parse_ptl(gb, hvcc, max_sub_layers_minus1);

        gb.readUEG();  // seq_parameter_set_id

        let separate_colour_plane_flag = 0;
        let chroma_format = gb.readUEG();  // chroma_format_idc
        if (chroma_format == 3) {
            separate_colour_plane_flag = gb.readBits(1);  // separate_colour_plane_flag
        }

        hvcc.sar_width = hvcc.sar_height = 1;
        hvcc.conf_win_left_offset = hvcc.conf_win_right_offset  =
        hvcc.conf_win_top_offset  = hvcc.conf_win_bottom_offset = 0;
        hvcc.def_disp_win_left_offset = hvcc.def_disp_win_right_offset =
        hvcc.def_disp_win_top_offset  = hvcc.def_disp_win_bottom_offset = 0;

        let pic_width_in_luma_samples  = gb.readUEG();  // pic_width_in_luma_samples
        let pic_height_in_luma_samples = gb.readUEG();  // pic_height_in_luma_samples

        let left_offset = 0, right_offset  = 0,
            top_offset  = 0, bottom_offset = 0;

        let conformance_window_flag = gb.readBits(1);
        if (conformance_window_flag) {
            hvcc.conf_win_left_offset   = gb.readUEG();  // conf_win_left_offset
            hvcc.conf_win_right_offset  = gb.readUEG();  // conf_win_right_offset
            hvcc.conf_win_top_offset    = gb.readUEG();  // conf_win_top_offset
            hvcc.conf_win_bottom_offset = gb.readUEG();  // conf_win_bottom_offset

            if (hvcc.default_display_window_flag === 1) {
                left_offset   = hvcc.conf_win_left_offset + hvcc.def_disp_win_left_offset;
                right_offset  = hvcc.conf_win_right_offset + hvcc.def_disp_win_right_offset;
                top_offset    = hvcc.conf_win_top_offset + hvcc.def_disp_win_top_offset;
                bottom_offset = hvcc.conf_win_bottom_offset + hvcc.def_disp_win_bottom_offset;
            }
        }

        let bit_depth = gb.readUEG() + 8;  // bit_depth_luma_minus8
        gb.readUEG();  // bit_depth_chroma_minus8
        let log2_max_pic_order_cnt_lsb_minus4 = gb.readUEG();

        /* sps_sub_layer_ordering_info_present_flag */
        let i = gb.readBits(1) ? 0 : max_sub_layers_minus1;
        for (; i <= max_sub_layers_minus1; i++) {
            HevcSPSParser._skip_sub_layer_ordering_info(gb);
        }

        gb.readUEG();  // log2_min_luma_coding_block_size_minus3
        gb.readUEG();  // log2_diff_max_min_luma_coding_block_size
        gb.readUEG();  // log2_min_transform_block_size_minus2
        gb.readUEG();  // log2_diff_max_min_transform_block_size
        gb.readUEG();  // max_transform_hierarchy_depth_inter
        gb.readUEG();  // max_transform_hierarchy_depth_intra

        if (gb.readBits(1) &&  // scaling_list_enabled_flag
            gb.readBits(1)) {  // sps_scaling_list_data_present_flag
            HevcSPSParser._skip_scaling_list_data(gb);
        }

        gb.readBits(1);  // amp_enabled_flag
        gb.readBits(1);  // sample_adaptive_offset_enabled_flag

        if (gb.readBits(1)) {  // pcm_enabled_flag
            gb.readBits(4);    // pcm_sample_bit_depth_luma_minus1
            gb.readBits(4);    // pcm_sample_bit_depth_chroma_minus1
            gb.readUEG();      // log2_min_pcm_luma_coding_block_size_minus3
            gb.readUEG();      // log2_diff_max_min_pcm_luma_coding_block_size
            gb.readBits(1);    // pcm_loop_filter_disabled_flag
        }

        let num_delta_pocs = [];
        let num_short_term_ref_pic_sets = gb.readUEG();
        for (i = 0; i < num_short_term_ref_pic_sets; i++) {
            let ret = HevcSPSParser._parse_rps(gb, i, num_short_term_ref_pic_sets, num_delta_pocs);
            if (ret < 0)
                return ret;
        }

        if (gb.readBits(1)) {  // long_term_ref_pics_present_flag
            let num_long_term_ref_pics_sps = gb.readUEG();
            for (i = 0; i < num_long_term_ref_pics_sps; i++) {  // num_long_term_ref_pics_sps
                let len = Math.min(log2_max_pic_order_cnt_lsb_minus4 + 4, 16);

                 // lt_ref_pic_poc_lsb_sps[i]
                if (len > 32) {
                    let d = len / 32;
                    let t = len % 32;
                    for (let j = 0; j < d; j++) {
                        gb.readBits(32);
                    }
                    gb.readBits(t);
                } else {
                    gb.readBits(len);
                }

                gb.readBits(1);  // used_by_curr_pic_lt_sps_flag[i]
            }
        }
        let ref_frames = 1; // TODO
    
        gb.readBits(1);  // sps_temporal_mvp_enabled_flag
        gb.readBits(1);  // strong_intra_smoothing_enabled_flag

        if (gb.readBits(1)) {  // vui_parameters_present_flag
            HevcSPSParser._hvcc_parse_vui(gb, hvcc, max_sub_layers_minus1);
        }

        let profile_string = HevcSPSParser.getProfileString(hvcc.profile_idc);
        let level_string = HevcSPSParser.getLevelString(hvcc.level_idc);

        let sarScale = 1;
        if (hvcc.sar_width !== 1 || hvcc.sar_height !== 1) {
            sarScale = hvcc.sar_width / hvcc.sar_height;
        }

        let codec_width  = pic_width_in_luma_samples,
            codec_height = pic_height_in_luma_samples;

        let sub_wc = (1 === chroma_format || 2 == chroma_format) && (0 === separate_colour_plane_flag) ? 2 : 1;
        let sub_hc = (1 === chroma_format) && (0 === separate_colour_plane_flag) ? 2 : 1;
        codec_width  -= sub_wc * (hvcc.conf_win_left_offset + hvcc.conf_win_right_offset);
        codec_height -= sub_hc * (hvcc.conf_win_top_offset  + hvcc.conf_win_bottom_offset);
    
        let present_width = Math.ceil(codec_width * sarScale);

        gb.destroy();
        gb = null;

        return {
            profile_string: profile_string,  // main, main10, rext, ...
            level_string: level_string,  // 3, 3.1, 4, 4.1, 5, 5.1, ...
            profile_idc: hvcc.profile_idc, // 1, 2, 3, 4 ...
            level_idc: hvcc.level_idc,
            bit_depth: bit_depth,  // 8bit, 10bit, ...
            ref_frames: ref_frames,
            chroma_format: chroma_format,  // 4:2:0, 4:2:2, ...
            chroma_format_string: HevcSPSParser.getChromaFormatString(chroma_format),

            frame_rate: {
                fixed: hvcc.fps_fixed,
                fps: hvcc.fps,
                fps_den: hvcc.fps_den,
                fps_num: hvcc.fps_num
            },

            sar_ratio: {
                width: hvcc.sar_width,
                height: hvcc.sar_height
            },

            codec_size: {
                width: codec_width,
                height: codec_height
            },

            present_size: {
                width: present_width,
                height: codec_height
            }
        };
    }

    static _hvcc_parse_ptl(gb, hvcc, max_sub_layers_minus1) {
        gb.readBits(2);  // profile_space
        let tier_flag = gb.readBits(1);
        let profile_idc = gb.readBits(5);  // profile_idc

        gb.readBits(32);  // profile_compatibility_flags
        gb.readBits(32);  // constraint_indicator_flags
        gb.readBits(16);
        let level_idc = gb.readByte();  // level_idc

        if (hvcc.tier_flag === undefined || hvcc.level_idc === undefined ||
            hvcc.tier_flag < tier_flag) {
            hvcc.level_idc = level_idc;
        } else {
            hvcc.level_idc = Math.max(hvcc.level_idc, level_idc);
        }
        hvcc.profile_idc = Math.max(hvcc.profile_idc === undefined ? 0 : hvcc.profile_idc, profile_idc);

        let sub_layer_profile_present_flag = [];
        let sub_layer_level_present_flag = [];
        for (let i = 0; i < max_sub_layers_minus1; i++) {
            sub_layer_profile_present_flag.push(gb.readBits(1));
            sub_layer_level_present_flag.push(gb.readBits(1));
        }

        if (max_sub_layers_minus1 > 0) {
            for (let i = max_sub_layers_minus1; i < 8; i++) {
                gb.readBits(2);  // reserved_zero_2bits[i]
            }
        }

        for (let i = 0; i < max_sub_layers_minus1; i++) {
            if (sub_layer_profile_present_flag[i]) {
                /*
                 * sub_layer_profile_space[i]                     u(2)
                 * sub_layer_tier_flag[i]                         u(1)
                 * sub_layer_profile_idc[i]                       u(5)
                 * sub_layer_profile_compatibility_flag[i][0..31] u(32)
                 * sub_layer_progressive_source_flag[i]           u(1)
                 * sub_layer_interlaced_source_flag[i]            u(1)
                 * sub_layer_non_packed_constraint_flag[i]        u(1)
                 * sub_layer_frame_only_constraint_flag[i]        u(1)
                 * sub_layer_reserved_zero_44bits[i]              u(44)
                 */
                gb.readBits(32);
                gb.readBits(32);
                gb.readBits(24);
            }
            if (sub_layer_level_present_flag[i]) {
                gb.readByte();
            }
        }
    }

    static _parse_rps(gb, rps_idx, num_rps, num_delta_pocs) {
        if (rps_idx && gb.readBits(1)) {  // inter_ref_pic_set_prediction_flag
            /* this should only happen for slice headers, and this isn't one */
            if (rps_idx >= num_rps)
                return -1;

            gb.readBits(1);  // delta_rps_sign
            gb.readUEG();    // abs_delta_rps_minus1

            num_delta_pocs[rps_idx] = 0;

            for (let i = 0; i <= num_delta_pocs[rps_idx - 1]; i++) {
                let use_delta_flag = 0;
                let used_by_curr_pic_flag = gb.readBits(1);
                if (!used_by_curr_pic_flag) {
                    use_delta_flag = gb.readBits(1);
                }
                if (used_by_curr_pic_flag || use_delta_flag) {
                    num_delta_pocs[rps_idx]++;
                }
            }
        } else {
            let num_negative_pics = gb.readUEG();
            let num_positive_pics = gb.readUEG();

            //if ((num_positive_pics + num_negative_pics) * 2 > gb.getBitsLeft())
            //    return -1;

            num_delta_pocs[rps_idx] = num_negative_pics + num_positive_pics;

            for (let i = 0; i < num_negative_pics; i++) {
                gb.readUEG();    // delta_poc_s0_minus1[rps_idx]
                gb.readBits(1);  // used_by_curr_pic_s0_flag[rps_idx]
            }

            for (i = 0; i < num_positive_pics; i++) {
                gb.readUEG();    // delta_poc_s1_minus1[rps_idx]
                gb.readBits(1);  // used_by_curr_pic_s1_flag[rps_idx]
            }
        }

        return 0;
    }

    static _hvcc_parse_vui(gb, hvcc, max_sub_layers_minus1) {
        if (gb.readBits(1)) {  // aspect_ratio_info_present_flag
            if (gb.readByte() == 255) {  // aspect_ratio_idc
                hvcc.sar_width  = gb.readBits(16);  // sar_width u(16)
                hvcc.sar_height = gb.readBits(16);  // sar_height u(16)
            }
        }
        if (gb.readBits(1)) {  // overscan_info_present_flag
            gb.readBits(1);  // overscan_appropriate_flag
        }

        if (gb.readBits(1)) {  // video_signal_type_present_flag
            gb.readBits(4);  // video_format u(3), video_full_range_flag u(1)

            if (gb.readBits(1)) {  // colour_description_present_flag
                /*
                 * colour_primaries         u(8)
                 * transfer_characteristics u(8)
                 * matrix_coeffs            u(8)
                 */
                gb.readBits(24);
            }
        }

        if (gb.readBits(1)) {  // chroma_loc_info_present_flag
            gb.readUEG();  // chroma_sample_loc_type_top_field
            gb.readUEG();  // chroma_sample_loc_type_bottom_field
        }

        /*
         * neutral_chroma_indication_flag u(1)
         * field_seq_flag                 u(1)
         * frame_field_info_present_flag  u(1)
         */
        gb.readBits(3);

        hvcc.default_display_window_flag = gb.readBits(1);  // default_display_window_flag
        if (hvcc.default_display_window_flag) {
            hvcc.def_disp_win_left_offset   = gb.readUEG();  // def_disp_win_left_offset
            hvcc.def_disp_win_right_offset  = gb.readUEG();  // def_disp_win_right_offset
            hvcc.def_disp_win_top_offset    = gb.readUEG();  // def_disp_win_top_offset
            hvcc.def_disp_win_bottom_offset = gb.readUEG();  // def_disp_win_bottom_offset
        }

        if (gb.readBits(1)) {  // vui_timing_info_present_flag
            HevcSPSParser._skip_timing_info(gb, hvcc);

            if (gb.readBits(1)) {  // vui_hrd_parameters_present_flag
                HevcSPSParser._skip_hrd_parameters(gb, hvcc, 1, max_sub_layers_minus1);
            }
        }

        if (gb.readBits(1)) {  // bitstream_restriction_flag
            /*
             * tiles_fixed_structure_flag              u(1)
             * motion_vectors_over_pic_boundaries_flag u(1)
             * restricted_ref_pic_lists_flag           u(1)
             */
            gb.readBits(3);

            gb.readUEG();  // min_spatial_segmentation_idc
            gb.readUEG();  // max_bytes_per_pic_denom
            gb.readUEG();  // max_bits_per_min_cu_denom
            gb.readUEG();  // log2_max_mv_length_horizontal
            gb.readUEG();  // log2_max_mv_length_vertical
        }
    }

    static _skip_sub_layer_ordering_info(gb, hvcc) {
        gb.readUEG();  // max_dec_pic_buffering_minus1
        gb.readUEG();  // max_num_reorder_pics
        gb.readUEG();  // max_latency_increase_plus1
    }

    static _skip_scaling_list_data(gb) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < (i == 3 ? 2 : 6); j++) {
                if (!gb.readBits(1)) {  // scaling_list_pred_mode_flag[i][j]
                    gb.readUEG();  // scaling_list_pred_matrix_id_delta[i][j]
                } else {
                    let num_coeffs = Math.min(64, 1 << (4 + (i << 1)));

                    if (i > 1) {
                        gb.readSEG();  // scaling_list_dc_coef_minus8[i-2][j]
                    }
                    for (let k = 0; k < num_coeffs; k++) {
                        gb.readSEG();  // scaling_list_delta_coef
                    }
                }
            }
        }
    }

    static _skip_sub_layer_hrd_parameters(gb, cpb_cnt_minus1, sub_pic_hrd_params_present_flag) {
        for (let i = 0; i <= cpb_cnt_minus1; i++) {
            gb.readUEG();  // bit_rate_value_minus1
            gb.readUEG();  // cpb_size_value_minus1

            if (sub_pic_hrd_params_present_flag) {
                gb.readUEG();  // cpb_size_du_value_minus1
                gb.readUEG();  // bit_rate_du_value_minus1
            }

            gb.readBits(1);  // cbr_flag
        }
    }

    static _skip_timing_info(gb, hvcc) {
        hvcc.fps_den = gb.readBits(32);  // num_units_in_tick
        hvcc.fps_num = gb.readBits(32);  // time_scale
        if (hvcc.fps_den > 0) {
            hvcc.fps = hvcc.fps_num / hvcc.fps_den;
        }

        let num_ticks_poc_diff_one_minus1 = 0;
        if (gb.readBits(1)) {  // poc_proportional_to_timing_flag
            num_ticks_poc_diff_one_minus1 = gb.readUEG();  // num_ticks_poc_diff_one_minus1
            if (num_ticks_poc_diff_one_minus1 >= 0) {
                hvcc.fps /= (num_ticks_poc_diff_one_minus1 + 1);
            }
        }
    }

    static _skip_hrd_parameters(gb, cprms_present_flag, max_sub_layers_minus1) {
        let sub_pic_hrd_params_present_flag = 0;
        let nal_hrd_parameters_present_flag = 0;
        let vcl_hrd_parameters_present_flag = 0;

        if (cprms_present_flag) {
            nal_hrd_parameters_present_flag = gb.readBits(1);
            vcl_hrd_parameters_present_flag = gb.readBits(1);

            if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
                let sub_pic_hrd_params_present_flag = gb.readBits(1);

                if (sub_pic_hrd_params_present_flag) {
                    /*
                     * tick_divisor_minus2                          u(8)
                     * du_cpb_removal_delay_increment_length_minus1 u(5)
                     * sub_pic_cpb_params_in_pic_timing_sei_flag    u(1)
                     * dpb_output_delay_du_length_minus1            u(5)
                     */
                    gb.readBits(19);
                }

                /*
                 * bit_rate_scale u(4)
                 * cpb_size_scale u(4)
                 */
                gb.readByte();

                if (sub_pic_hrd_params_present_flag) {
                    gb.readBits(4);  // cpb_size_du_scale
                }

                /*
                 * initial_cpb_removal_delay_length_minus1 u(5)
                 * au_cpb_removal_delay_length_minus1      u(5)
                 * dpb_output_delay_length_minus1          u(5)
                 */
                gb.readBits(15);
            }
        }

        for (let i = 0; i <= max_sub_layers_minus1; i++) {
            let cpb_cnt_minus1 = 0;
            let low_delay_hrd_flag = 0;
            let fixed_pic_rate_within_cvs_flag = 0;
            let fixed_pic_rate_general_flag = gb.readBits(1);
    
            hvcc.fps_fixed = fixed_pic_rate_general_flag;

            if (!fixed_pic_rate_general_flag) {
                fixed_pic_rate_within_cvs_flag = gb.readBits(1);
            }
    
            if (fixed_pic_rate_within_cvs_flag) {
                gb.readUEG();  // elemental_duration_in_tc_minus1
            } else {
                low_delay_hrd_flag = gb.readBits(1);
            }
    
            if (!low_delay_hrd_flag) {
                cpb_cnt_minus1 = gb.readUEG(gb);
            }
    
            if (nal_hrd_parameters_present_flag) {
                HevcSPSParser._skip_sub_layer_hrd_parameters(
                    gb, cpb_cnt_minus1, sub_pic_hrd_params_present_flag);
            }
    
            if (vcl_hrd_parameters_present_flag) {
                HevcSPSParser._skip_sub_layer_hrd_parameters(
                    gb, cpb_cnt_minus1, sub_pic_hrd_params_present_flag);
            }
        }
    }

    static getProfileString(profile_idc) {
        switch (profile_idc) {
            case 1:
                return 'Main';
            case 2:
                return 'Main10';
            case 3:
                return 'MainSP'; // MainStillPictrue
            case 4:
                return 'Rext';
            case 9:
                return 'SCC';
            default:
                return 'Unknown';
        }
    }

    static getLevelString(level_idc) {
        return (level_idc / 30).toFixed(1);
    }

    static getChromaFormatString(chroma) {
        switch (chroma) {
            case 0:
                return '4:0:0';
            case 1:
                return '4:2:0';
            case 2:
                return '4:2:2';
            case 3:
                return '4:4:4';
            default:
                return 'Unknown';
        }
    }

}

export default HevcSPSParser;