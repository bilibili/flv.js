
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
uniform bool show_original;
uniform bool draw_debug;

bool drawCircle(in highp vec2 center, in highp float radius, in highp vec2 uv, in highp vec4 circleColor, in highp vec4 color) {
    highp float result = length(uv-center);
    if (result - radius < 0.001 && result - radius > - 0.001) {
        return true;
    } else {
        return false;
    }
}

bool drawArc(in highp vec2 center, in highp float radius, in highp vec2 start, in highp vec2 end, in highp vec2 uv, in highp vec4 circleColor, in highp vec4 color) {
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

bool drawLine(in highp vec2 a, in highp vec2 b, in highp vec2 c, in highp vec4 color) {
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

    bool flip = false;

    highp vec2 pixelDir = normalize(rotate(lStart, -fov * uv.x)); // Direction of ray that this pixel will interpolate from
    highp vec2 rayStart = lpos + pixelDir * inner_radius; // multiply the direction by the radius of the inner frustum and offset by position
    highp vec2 rayEnd = lpos + pixelDir * sphereIntersect(lpos, pixelDir * 1.0, outer_radius, vec2(0.5, 0.5)).y; // find distance to outer frustum and clip our ray to this point

    uv.x -= 0.5;
    uv.x *= lens_aspect_ratio;
    uv.x += 0.5;

    highp vec4 color = texture2D(uSampler, vTextureCoord);
    highp vec2 leftFar = sphereIntersect(lpos, lpos + lStart * outer_radius, outer_radius, vec2(0.5, 0.5));
    highp vec2 rightFar = sphereIntersect(lpos, lpos + rStart * outer_radius, outer_radius, vec2(0.5, 0.5));
    bool drawColor = false;
    drawColor = drawColor || drawCircle(vec2(0.5, 0.5), outer_radius, uv, vec4(1.0, 0.0, 0.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos, inner_radius, uv, vec4(1.0, 0.0, 0.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos, inner_radius, uv, vec4(1.0, 0.0, 0.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos+ rStart * inner_radius, 0.01, uv, vec4(1.0, 0.0, 1.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos+ lStart * inner_radius, 0.01, uv, vec4(1.0, 1.0, 0.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos + lStart * leftFar.y, 0.01, uv, vec4(1.0, 1.0, 0.0, 1.0), color);
    drawColor = drawColor || drawCircle(lpos + rStart * rightFar.y, 0.01, uv, vec4(1.0, 0.0, 1.0, 1.0), color);
    drawColor = drawColor || drawLine(lpos+lStart*inner_radius, lpos + lStart * leftFar.y, uv, color);
    drawColor = drawColor || drawLine(lpos+rStart*inner_radius, lpos + rStart * leftFar.y, uv, color);

    if (drawColor)
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    else
        discard;

}