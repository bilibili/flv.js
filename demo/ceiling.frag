
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
uniform highp float distortion;
uniform highp vec2 offset;
uniform bool show_original;
uniform bool draw_debug;

highp vec4 drawCircle(in highp vec2 center, in highp float radius, in highp vec2 uv, in highp vec4 circleColor, in highp vec4 color) {
    highp float result = length(uv-center);
    if (result - radius < 0.001 && result - radius > - 0.001) {
        return circleColor;
    } else {
        return color;
    }
}

highp vec4 drawLine(in highp vec2 a, in highp vec2 b, in highp vec2 c, in highp vec4 color) {
    highp float res;
    res = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
    if(res < 0.001 && res > -0.001) {
        return vec4(1.0, 0, 0, 1.0);
    } else{
        return color;
    }
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
    highp vec2 res = mix(rayStart, rayEnd, uv.y);

    res.x -= 0.5;
    res.x *= inverse_lens_aspect_ratio; //our result coordinates need to have the inverse aspect ratio correction applied
    res.x += 0.5;

    res.y = 1.0 - res.y;

    gl_FragColor = texture2D(uSampler, res);
}