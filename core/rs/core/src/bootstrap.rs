use core::ffi::c_char;

use sqlite_nostd as sqlite;

fn uuid(blob: &mut [u8]) {
    sqlite::randomness(blob);
}
