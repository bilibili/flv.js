highp vec4 drawCircle(in highp vec2 center, in highp float radius, in highp vec2 uv, in highp vec4 color) {
   highp float result = length(uv-center);
    if (result - radius < 0.001 && result - radius > - 0.001) {
        return vec4(1.0, 0, 0, 1.0);
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
    highp vec2 oc = rayOrigin - center;
    highp float b = dot( oc, rayDirection );
    highp float c = dot( oc, oc ) - radius*radius;
    highp float h = b*b - c;
    if( h<0.0 ) return vec2(-1.0); // no intersection
    h = sqrt( h );
    return vec2( -b-h, -b+h );
}

void main(void)
{
	highp vec2 uv = highp vec2 vNewCoord = vTextureCoord;;

    bool flip;
    highp float aspect_ratio = 16.0/9.0;
    highp float azimuth = 45.0 * 0.0174533;
    highp float front_clip = 0.1;
    highp vec2 dir = vec2(sin(azimuth), cos(azimuth));
    highp float lens_factor = 0.11;
    highp float near_width = 0.6;
    highp float outer_radius = 0.48;
    highp vec2 pos = vec2(0.5, 0.5) + dir * front_clip;
    highp float radius = (lens_factor/2.0) + ((near_width*near_width) / (8.0 * lens_factor));
    highp float fov = 90.0 * 0.0174533;

    highp vec2 lStart = rotate(dir, -fov/2.0);
    highp vec2 rStart = rotate(dir, fov/2.0);
    highp vec2 lpos = pos - (dir * (radius-lens_factor));
	//highp vec2 collision_point = lpos + lStart * outer_radius + vec2((radius-lens_factor)/2.0, 0.0);
    highp vec2 leftFar = sphereIntersect(lpos, lpos + lStart * outer_radius, outer_radius, vec2(0.5, 0.5));
	highp vec2 rightFar = sphereIntersect(lpos, lpos + rStart * outer_radius, outer_radius, vec2(0.5, 0.5));
	uv.x -= 0.5;
    uv.x *= aspect_ratio;
    highp float newX = uv.x * dir.y - uv.y * dir.x;
	highp float newY = uv.x * dir.x + uv.y * dir.y;
    //uv.x = newX;
    //uv.y = newY;
    uv.x += 0.5;
    highp vec2 width = rStart - lStart;

    highp vec2 pixelDir = normalize(vec2(lpos.x + lStart.x + width.x * uv.x, lpos.y + lStart.y));
    highp vec2 rayStart = lpos + pixelDir * radius;
    highp float endDist = sphereIntersect(lpos, pixelDir, outer_radius, vec2(0.5, 0.5)).y;
    highp vec2 rayEnd = lpos + pixelDir * endDist;
    highp vec2 res = mix(rayEnd, rayStart, uv.y);

    res = uv;
    vec4 color = texture(iChannel1, res);
    color = drawCircle(vec2(0.5, 0.5), outer_radius, uv, color);
    color = drawCircle(lpos, radius, uv, color);
    color = drawLine(lpos, lpos + lStart * 1.0, uv, color);
    color = drawLine(lpos, lpos + rStart * 1.0, uv, color);
    //color = drawLine(lpos - lStart * leftFar.y, lpos - lStart * leftFar.y + vec2(0, 1), uv, color);
    //color = drawLine(lpos + lStart * leftFar.y, lpos + lStart * leftFar.y + vec2(0, 1), uv, color);
    //color = drawLine(lpos + lStart * radius, lpos + lStart * radius + vec2(0, 1), uv, color);
    //color = drawLine(lpos + rStart * radius, lpos + rStart * radius + vec2(0, 1), uv, color);
    fragColor = color;
    //fragColor = vec4(leftFar.x/10.0, leftFar.y, 0.0, 1.0);
}