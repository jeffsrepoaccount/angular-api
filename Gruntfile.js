/**
 * angular-api gruntfile
 *
 * Usage: 
 *  grunt build
 *  grunt test
 */
module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-banner');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        copy: {
            js: {
                files: [{
                    expand: true,
                    flatten: true,
                    dest: './dist/',
                    src: [ './tmp/*' ]
                }]
            }
        },
        clean: {
            dist: {
                files: [{
                    dot: true,
                    src: [
                        './dist/*', 
                    ]
                }]
            },
            cleanup: {
                files: [{
                    dot: true,
                    src: [ './tmp' ]
                }]
            }
        },
        usebanner: {
            options: {
                position: 'top',
                banner: '/*! <%= pkg.name %>, built <%= grunt.template.today("isoDateTime") %> | (C) <%= grunt.template.today("yyyy") %> Jeff Lambert | License: MIT */',
                linebreak: true
            },
            src: [ './dist/*' ]
        },
        uglify: {
            js: {
                files: {
                    './tmp/angular-api.min.js': [ './src/*.js' ]
                },
                options: {
                    mangle: false
                }
            }
        }
    });

    grunt.registerTask('build', function() {
        grunt.task.run([
            'clean:dist',
            'uglify:js',
            'copy:js',
            'usebanner',
            'clean:cleanup'
        ]);
    });

    grunt.registerTask('test', function() {
        //
    });
};
