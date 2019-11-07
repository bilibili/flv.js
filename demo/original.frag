
varying highp vec2 vTextureCoord;
 uniform sampler2D uSampler;
 uniform highp float azimuth;
 uniform highp float lens_factor;
 uniform highp float lens_aspect_ratio;
 uniform highp float front_clip;
 uniform highp float near_width;
 uniform highp float fov;
 uniform highp float outer_radius;
 uniform highp vec2 rStart;
 uniform highp vec2 lStart;
 uniform highp vec2 lpos;
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
	highp vec2 uv = vTextureCoord;;

    bool flip = false;
    highp float aspect_ratio = lens_aspect_ratio;



    // this allows us to change the lens aperature without moving the near clip which is crucial for tweaking values

    highp vec2 nearPlane = rStart-lStart; // Vector from left to right near plane points
    highp vec2 pixelDir = normalize(rotate(lStart, -fov * uv.x)); // Direction of ray that this pixel will interpolate from
    // this is interpolted along the uv.x, meaning the bottom left of the image will be at the left near frustum
    //and bottom right will be at the right near

    highp vec2 rayStart = lpos + pixelDir * radius; // multiply the direction by the radius of the inner frustum and offset by position
    highp vec2 rayEnd = lpos + pixelDir * sphereIntersect(lpos, pixelDir * 1.0, outer_radius, vec2(0.5, 0.5)).y; // find distance to outer frustum and clip our ray to this point
    highp vec2 res;

    if (flip) // ground mounted cameras will have their images flipped vertically
        res = mix(rayEnd, rayStart, uv.y);
    else
        res = mix(rayStart, rayEnd, uv.y);

    res.x -= 0.5;
    res.x *= 1.0/aspect_ratio; //our result coordinates need to have the inverse aspect ratio correction applied
    res.x += 0.5;

    if (show_original) {
    	uv.x -= 0.5;
        uv.x *= aspect_ratio;
        uv.x += 0.5;
        res = vTextureCoord;
    }


    highp vec4 color = texture2D(uSampler, res);
    if (res.x > 1.0 || res.y > 1.0)
        color = vec4(0.0, 0.0, 0.0, 1.0);
    if (draw_debug) { // this shits nasty af
        highp vec2 leftFar = sphereIntersect(lpos, lpos + lStart * outer_radius, outer_radius, vec2(0.5, 0.5));
        highp vec2 rightFar = sphereIntersect(lpos, lpos + rStart * outer_radius, outer_radius, vec2(0.5, 0.5));
        color = drawCircle(vec2(0.5, 0.5), outer_radius, uv, vec4(1.0, 0.0, 0.0, 1.0), color);
        color = drawCircle(lpos, radius, uv, vec4(1.0, 0.0, 0.0, 1.0), color);
        color = drawCircle(lpos+ lStart * radius, 0.01, uv, vec4(1.0, 1.0, 0.0, 1.0), color);
        color = drawCircle(lpos+ rStart * radius, 0.01, uv, vec4(1.0, 0.0, 1.0, 1.0), color);
        color = drawCircle(lpos + lStart * leftFar.y, 0.01, uv, vec4(1.0, 1.0, 0.0, 1.0), color);
        color = drawCircle(lpos + rStart * rightFar.y, 0.01, uv, vec4(1.0, 0.0, 1.0, 1.0), color);
        color = drawLine(lpos, lpos + lStart * leftFar.y, uv, color);
        color = drawLine(lpos, lpos + rStart * leftFar.y, uv, color);
    }

    gl_FragColor = color;
}