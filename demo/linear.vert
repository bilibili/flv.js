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
uniform highp float distortion;

void main(void) {
	gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
	vTextureCoord = aTextureCoord;
}