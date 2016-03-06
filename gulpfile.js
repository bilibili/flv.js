'use strict';

var del = require('del');
var gulp = require('gulp');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var eslint = require('gulp-eslint');
var sourcemaps = require('gulp-sourcemaps');
var babelify = require('babelify');
var browserify = require('browserify');
var watchify = require('watchify');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');


function doWatchify() {
    var customOpts = {
        entries: 'src/flv.js',
        debug: true,
        transform: [babelify]
    };

    var opts = Object.assign({}, watchify.args, customOpts);
    var b = watchify(browserify(opts));

    b.on('update', doBundle.bind(global, b));
    b.on('log', console.log.bind(console));

    return b;
}

function doBundle(b) {
    return b.bundle()
        .on('error', console.error.bind(console))
        .pipe(source('flv.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({loadMaps: true}))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./dist/'));
}

gulp.task('watchify', doBundle.bind(global, doWatchify()));
gulp.task('default', ['clean', 'build']);
gulp.task('release', ['clean', 'lint', 'build', 'minimize']);

gulp.task('clean', function () {
    return del([
        'dist/*'
    ]);
});

gulp.task('lint', function () {
    return gulp.src(['gulpfile.js', 'src/**/*.js'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('build', ['clean'], function () {
    var b = browserify({
        entries: 'src/flv.js',
        debug: true,
        transform: [babelify]
    });

    return doBundle(b);
});

gulp.task('minimize', ['lint', 'build'], function () {
    var options = {
        sourceMap: true,
        sourceMapIncludeSources: true,
        sourceMapRoot: './src/',
        mangle: true,
        compress: {
            sequences: true,
            dead_code: true,
            conditionals: true,
            booleans: true,
            unused: true,
            if_return: true,
            join_vars: true
        }
    };

    return gulp.src('dist/flv.js')
        .pipe(rename({extname: '.min.js'}))
        .pipe(sourcemaps.init({loadMaps: true}))
            .pipe(uglify(options))
            .on('error', console.error.bind(console))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./dist/'));
});