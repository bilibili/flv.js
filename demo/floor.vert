attribute vec4 aVertexPosition;
attribute vec3 aVertexNormal;
attribute vec2 aTextureCoord;
uniform mat4 uNormalMatrix;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 extents;
uniform highp float azimuth;
uniform highp vec2 lStart;
uniform highp float fov;
varying highp vec2 vTextureCoord;
varying highp vec3 vLighting;

highp vec2 rotate(in vec2 vec, in highp float radians) {
	highp vec2 dir = vec2(sin(radians), cos(radians));

	return vec2(vec.x * dir.y - vec.y * dir.x, vec.x * dir.x + vec.y * dir.y);
}

void main(void) {
	gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
	vTextureCoord = aTextureCoord;
}