
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
uniform highp vec4 output_color;
uniform highp vec2 offset;
uniform bool show_original;
uniform bool draw_debug;

bool drawCircle(in highp vec2 center, in highp float radius, in highp vec2 uv) {
    highp float result = length(uv-center);
    if (result - radius < 0.001 && result - radius > - 0.001) {
        return true;
    } else {
        return false;
    }
}

bool drawArc(in highp vec2 center, in highp float radius, in highp vec2 start, in highp vec2 end, in highp vec2 uv) {
    highp float result = length(uv-center);
    highp vec2 start_dir = start-center;
    highp vec2 start_norm = vec2(-start_dir.y, start_dir.x);

    highp vec2 end_dir = end-center;
    highp vec2 end_norm = vec2(-end_dir.y, end_dir.x);

    if (result - radius < 0.0025 && result - radius > - 0.0025) {

        if (dot(start_norm, uv-center) < 0.001 && dot(end_norm, uv-center) > 0.001)
            return true;
    }
    return false;

}

bool drawLine(in highp vec2 a, in highp vec2 b, in highp vec2 c) {
    highp float res;
    highp float d1 = length(c-a);
    highp float d2 = length(c-b);
    highp float d3 = length(b-a);

    res = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
    if(res < 0.001 && res > -0.001) {
        if (abs(d1+d2-d3) < 0.001)
            return true;
    }
    return false;

}

highp vec2 rotate(in vec2 vec, in highp float radians) {
    highp vec2 dir = vec2(sin(radians), cos(radians));

    return vec2(vec.x * dir.y - vec.y * dir.x, vec.x * dir.x + vec.y * dir.y);
}

highp vec2 sphereIntersect( in vec2 rayOrigin, in vec2 rayDirection, highp float radius, in vec2 center )
{
    highp vec2 oc = rayOrigin-center;
    highp float b = dot( oc, rayDirection );
    highp float c = dot( oc, oc ) - radius*radius;
    highp float h = b*b - c;
    if( h<0.0 ) return vec2(-1.0); // no intersection
    h = sqrt( h );
    return vec2( -b-h, -b+h );
}

void main(void)
{
    highp vec2 uv = vTextureCoord;

    uv.x -= 0.5;
    uv.x *= lens_aspect_ratio;
    uv.x += 0.5;

    bool drawColor = false;

    uv.x -= offset.x;
    uv.y -= offset.y;

    highp vec2 leftFar = sphereIntersect(lpos, lStart, outer_radius, vec2(0.5, 0.5));
    highp vec2 rightFar = sphereIntersect(lpos, rStart, outer_radius, vec2(0.5, 0.5));
    drawColor = drawColor || drawArc(vec2(0.5, 0.5), outer_radius, (vec2(0.5, 0.5) + lStart * leftFar.y) - (vec2(0.5, 0.5) - lpos), (vec2(0.5, 0.5) + rStart * rightFar.y) - (vec2(0.5, 0.5) - lpos), uv);
    drawColor = drawColor || drawArc(lpos, inner_radius, lpos + lStart, lpos + rStart, uv);
    drawColor = drawColor || drawLine(lpos+lStart*inner_radius, lpos + lStart * leftFar.y, uv);
    drawColor = drawColor || drawLine(lpos+rStart*inner_radius, lpos + rStart * leftFar.y, uv);

    if (drawColor)
        gl_FragColor = output_color;
    else
        discard;
}