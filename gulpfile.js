const gulp = require('gulp');
const babel = require('gulp-babel');
const del = require('del');

gulp.task('build-js', () => {
    return gulp.src('public/src/js/**/*.js')
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(gulp.dest('public/build/js'));
});

gulp.task('build-css', () => {
    return gulp.src('public/src/css/**/*')
        .pipe(gulp.dest('public/build/css'));
});

gulp.task('build-resources', () => {
    return gulp.src('public/src/resources/**/*')
        .pipe(gulp.dest('public/build/resources'));
});

gulp.task('clean', () => {
    // You can use multiple globbing patterns as you would with `gulp.src`
    return del(['public/build/**/*']);
});

gulp.task('default', ['build-js', 'build-css', 'build-resources']);