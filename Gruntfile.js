module.exports = function(grunt) {
    
    grunt.initConfig({
        clean: {
            build: ['build/temp'],
            dist: ['dist/*']
        },
        
        jshint: {
            src: {
                src: ['src/*.js', 'src/**/*.js', 'Gruntfile.js'],
                options: {
                    jshintrc: '.jshintrc'
                }
            }
        },
        
        uglify: {
            options: {
                sourceMap: true,
                sourceMapIncludeSources: true,
                sourceMapRoot: './src/',
                preserveComments: 'some',
                mangle: true,
                compress: {
                    sequences: true,
                    dead_code: true,
                    conditionals: true,
                    booleans: true,
                    unused: true,
                    if_return: true,
                    join_vars: true,
                    //drop_console: true
                }
            },
            
            build_all: {
                options: {
                    sourceMap: true
                },
                files: {
                    'dist/flv.min.js': 'dist/flv.debug.js'
                }
            },
        },
        
        exorcise: {
            all: {
                options: {},
                files: {
                    'dist/flv.debug.js.map': ['dist/flv.debug.js']
                }
            }
        },
        
        browserify: {
            all: {
                files: {
                    'dist/flv.debug.js': 'src/flv.js'
                },
                options: {
                    browserifyOptions: {
                        debug: true,
                    },
                    plugin: [
                        ['browserify-derequire']
                    ],
                    transform: ['babelify']
                }
            }
        },

        jscs: {
            src: ['./src/*.js', './src/**/*.js'],
            options: {
                config: '.jscsrc'
            }
        }
    });
    
    require('load-grunt-tasks')(grunt);
    grunt.registerTask('default',  ['dist']);
    grunt.registerTask('dist',     ['clean', 'jshint', 'jscs', 'browserify', 'minimize']);
    grunt.registerTask('minimize', ['exorcise', 'uglify']);
    grunt.registerTask('release',  ['default', 'jsdoc']);
    grunt.registerTask('debug',    ['clean', 'browserify:all', 'exorcise:all', 'uglify:build_all']);
    
};