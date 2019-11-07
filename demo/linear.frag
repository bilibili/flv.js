
varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp float azimuth;
uniform highp float lens_factor;
uniform highp float lens_aspect_ratio;
uniform highp float inverse_lens_aspect_ratio;
uniform highp float front_clip;
uniform highp float near_width;
uniform highp float fov;
uniform highp float outer_radius;
uniform highp float inner_radius;
uniform highp vec2 lpos;
uniform highp vec2 lStart;
uniform highp vec2 rStart;
uniform highp vec2 offset;
uniform bool show_original;
uniform bool draw_debug;


void main(void)
{
    highp vec2 uv = vec2(vTextureCoord.x, 1.0-vTextureCoord.y);
    highp vec4 color = texture2D(uSampler, uv);
    gl_FragColor = color;
}