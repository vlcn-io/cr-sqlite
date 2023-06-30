extern crate alloc;

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use bytes::{Buf, BufMut};
use core::slice;
#[cfg(not(feature = "std"))]
use num_traits::FromPrimitive;
use sqlite_nostd as sqlite;
use sqlite_nostd::{ColumnType, Context, ResultCode, Value};

pub extern "C" fn crsql_concat_columns(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);

    match concat_columns(args) {
        Err(code) => {
            ctx.result_error("Failed to concatenate columns");
            ctx.result_error_code(code);
        }
        Ok(blob) => {
            ctx.result_blob_owned(blob);
        }
    }
}

fn concat_columns(args: &[*mut sqlite::value]) -> Result<Vec<u8>, ResultCode> {
    let mut buf = vec![];
    /*
     * Format:
     * [num_columns:u8,...[type:u8, length?:i32, ...bytes:u8[]]]
     */
    let len_result: Result<u8, _> = args.len().try_into();
    if let Ok(len) = len_result {
        buf.put_u8(len);
        for value in args {
            match value.value_type() {
                ColumnType::Blob => {
                    buf.put_u8(ColumnType::Blob as u8);
                    buf.put_i32(value.bytes());
                    buf.put_slice(value.blob());
                }
                ColumnType::Null => {
                    buf.put_u8(ColumnType::Null as u8);
                }
                ColumnType::Float => {
                    buf.put_u8(ColumnType::Float as u8);
                    buf.put_f64(value.double());
                }
                ColumnType::Integer => {
                    buf.put_u8(ColumnType::Integer as u8);
                    buf.put_i64(value.int64());
                }
                ColumnType::Text => {
                    buf.put_u8(ColumnType::Text as u8);
                    buf.put_i32(value.bytes());
                    buf.put_slice(value.blob());
                }
            }
        }
        Ok(buf)
    } else {
        Err(ResultCode::ABORT)
    }
}

pub enum ColumnValue {
    Blob(Vec<u8>),
    Float(f64),
    Integer(i64),
    Null,
    Text(String),
}

pub fn unpack_columns(data: Vec<u8>) -> Result<Vec<ColumnValue>, ResultCode> {
    let mut ret = vec![];
    let mut buf = &data[..];
    let num_columns = buf.get_u8();

    for _i in 0..num_columns {
        if !buf.has_remaining() {
            return Err(ResultCode::ABORT);
        }
        let column_type = ColumnType::from_u8(buf.get_u8());

        match column_type {
            Some(ColumnType::Blob) => {
                if buf.remaining() < 4 {
                    return Err(ResultCode::ABORT);
                }
                let len = buf.get_i32() as usize;
                if buf.remaining() < len {
                    return Err(ResultCode::ABORT);
                }
                let bytes = buf.copy_to_bytes(len);
                ret.push(ColumnValue::Blob(bytes.to_vec()));
            }
            Some(ColumnType::Float) => {
                if buf.remaining() < 8 {
                    return Err(ResultCode::ABORT);
                }
                ret.push(ColumnValue::Float(buf.get_f64()));
            }
            Some(ColumnType::Integer) => {
                if buf.remaining() < 8 {
                    return Err(ResultCode::ABORT);
                }
                ret.push(ColumnValue::Integer(buf.get_i64()));
            }
            Some(ColumnType::Null) => {
                ret.push(ColumnValue::Null);
            }
            Some(ColumnType::Text) => {
                if buf.remaining() < 4 {
                    return Err(ResultCode::ABORT);
                }
                let len = buf.get_i32() as usize;
                if buf.remaining() < len {
                    return Err(ResultCode::ABORT);
                }
                let bytes = buf.copy_to_bytes(len);
                ret.push(ColumnValue::Text(unsafe {
                    String::from_utf8_unchecked(bytes.to_vec())
                }))
            }
            None => return Err(ResultCode::MISUSE),
        }
    }

    Ok(ret)
}
