extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec;
use core::ffi::CStr;
use core::str::Utf8Error;

// Structs that still exist in C but will eventually be moved to Rust
// As well as functions re-defined in Rust but not yet deleted from C
use sqlite_nostd::bindings::sqlite3_int64;
use sqlite_nostd::bindings::sqlite3_stmt;

pub static INSERT_SENTINEL: &str = "__crsql_pko";
pub static DELETE_SENTINEL: &str = "__crsql_del";

#[repr(C)]
#[derive(Debug, Copy, Clone)]
#[allow(non_snake_case)]
pub struct crsql_TableInfo {
    pub tblName: *mut ::core::ffi::c_char,
    pub baseCols: *mut crsql_ColumnInfo,
    pub baseColsLen: ::core::ffi::c_int,
    pub pks: *mut crsql_ColumnInfo,
    pub pksLen: ::core::ffi::c_int,
    pub nonPks: *mut crsql_ColumnInfo,
    pub nonPksLen: ::core::ffi::c_int,
}

#[repr(C)]
#[derive(Debug, Copy, Clone)]
#[allow(non_snake_case)]
pub struct crsql_ColumnInfo {
    pub cid: ::core::ffi::c_int,
    pub name: *mut ::core::ffi::c_char,
    pub type_: *mut ::core::ffi::c_char,
    pub notnull: ::core::ffi::c_int,
    pub pk: ::core::ffi::c_int,
}

#[repr(C)]
#[derive(Debug, Copy, Clone)]
#[allow(non_snake_case)]
pub struct crsql_ExtData {
    pub pPragmaSchemaVersionStmt: *mut sqlite3_stmt,
    pub pPragmaDataVersionStmt: *mut sqlite3_stmt,
    pub pragmaDataVersion: ::core::ffi::c_int,
    pub dbVersion: sqlite3_int64,
    pub pragmaSchemaVersion: ::core::ffi::c_int,
    pub pragmaSchemaVersionForTableInfos: ::core::ffi::c_int,
    pub siteId: *mut ::core::ffi::c_uchar,
    pub pDbVersionStmt: *mut sqlite3_stmt,
    pub zpTableInfos: *mut *mut crsql_TableInfo,
    pub tableInfosLen: ::core::ffi::c_int,
    pub rowsImpacted: ::core::ffi::c_int,
    pub seq: ::core::ffi::c_int,
    pub pSetSyncBitStmt: *mut sqlite3_stmt,
    pub pClearSyncBitStmt: *mut sqlite3_stmt,
    pub hStmts: *mut ::core::ffi::c_void,
}

pub fn as_identifier_list(
    columns: &[crsql_ColumnInfo],
    prefix: Option<&str>,
) -> Result<String, Utf8Error> {
    let mut result = vec![];
    for c in columns {
        let name = unsafe { CStr::from_ptr(c.name) };
        result.push(if let Some(prefix) = prefix {
            format!("{}\"{}\"", prefix, crate::escape_ident(name.to_str()?))
        } else {
            format!("\"{}\"", crate::escape_ident(name.to_str()?))
        })
    }
    Ok(result.join(","))
}

pub fn pk_where_list(
    columns: &[crsql_ColumnInfo],
    rhs_prefix: Option<&str>,
) -> Result<String, Utf8Error> {
    let mut result = vec![];
    for c in columns {
        let name = unsafe { CStr::from_ptr(c.name) };
        result.push(if let Some(prefix) = rhs_prefix {
            format!(
                "\"{col_name}\" = {prefix}\"{col_name}\"",
                prefix = prefix,
                col_name = crate::escape_ident(name.to_str()?)
            )
        } else {
            format!(
                "\"{col_name}\" = \"{col_name}\"",
                col_name = crate::escape_ident(name.to_str()?)
            )
        })
    }
    Ok(result.join(" AND "))
}

pub fn where_list(columns: &[crsql_ColumnInfo]) -> Result<String, Utf8Error> {
    let mut result = vec![];
    for c in columns {
        let name = unsafe { CStr::from_ptr(c.name) };
        result.push(format!(
            "\"{col_name}\" = ?",
            col_name = crate::escape_ident(name.to_str()?)
        ));
    }

    Ok(result.join(" AND "))
}

#[test]
#[allow(non_snake_case)]
fn bindgen_test_layout_crsql_ColumnInfo() {
    const UNINIT: ::core::mem::MaybeUninit<crsql_ColumnInfo> = ::core::mem::MaybeUninit::uninit();
    let ptr = UNINIT.as_ptr();
    assert_eq!(
        ::core::mem::size_of::<crsql_ColumnInfo>(),
        32usize,
        concat!("Size of: ", stringify!(crsql_ColumnInfo))
    );
    assert_eq!(
        ::core::mem::align_of::<crsql_ColumnInfo>(),
        8usize,
        concat!("Alignment of ", stringify!(crsql_ColumnInfo))
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).cid) as usize - ptr as usize },
        0usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ColumnInfo),
            "::",
            stringify!(cid)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).name) as usize - ptr as usize },
        8usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ColumnInfo),
            "::",
            stringify!(name)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).type_) as usize - ptr as usize },
        16usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ColumnInfo),
            "::",
            stringify!(type_)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).notnull) as usize - ptr as usize },
        24usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ColumnInfo),
            "::",
            stringify!(notnull)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pk) as usize - ptr as usize },
        28usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ColumnInfo),
            "::",
            stringify!(pk)
        )
    );
}

#[test]
#[allow(non_snake_case)]
fn bindgen_test_layout_crsql_TableInfo() {
    const UNINIT: ::core::mem::MaybeUninit<crsql_TableInfo> = ::core::mem::MaybeUninit::uninit();
    let ptr = UNINIT.as_ptr();
    assert_eq!(
        ::core::mem::size_of::<crsql_TableInfo>(),
        56usize,
        concat!("Size of: ", stringify!(crsql_TableInfo))
    );
    assert_eq!(
        ::core::mem::align_of::<crsql_TableInfo>(),
        8usize,
        concat!("Alignment of ", stringify!(crsql_TableInfo))
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).tblName) as usize - ptr as usize },
        0usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(tblName)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).baseCols) as usize - ptr as usize },
        8usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(baseCols)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).baseColsLen) as usize - ptr as usize },
        16usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(baseColsLen)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pks) as usize - ptr as usize },
        24usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(pks)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pksLen) as usize - ptr as usize },
        32usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(pksLen)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).nonPks) as usize - ptr as usize },
        40usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(nonPks)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).nonPksLen) as usize - ptr as usize },
        48usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_TableInfo),
            "::",
            stringify!(nonPksLen)
        )
    );
}

#[test]
#[allow(non_snake_case)]
fn bindgen_test_layout_crsql_ExtData() {
    const UNINIT: ::core::mem::MaybeUninit<crsql_ExtData> = ::core::mem::MaybeUninit::uninit();
    let ptr = UNINIT.as_ptr();
    assert_eq!(
        ::core::mem::size_of::<crsql_ExtData>(),
        104usize,
        concat!("Size of: ", stringify!(crsql_ExtData))
    );
    assert_eq!(
        ::core::mem::align_of::<crsql_ExtData>(),
        8usize,
        concat!("Alignment of ", stringify!(crsql_ExtData))
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pPragmaSchemaVersionStmt) as usize - ptr as usize },
        0usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pPragmaSchemaVersionStmt)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pPragmaDataVersionStmt) as usize - ptr as usize },
        8usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pPragmaDataVersionStmt)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pragmaDataVersion) as usize - ptr as usize },
        16usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pragmaDataVersion)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).dbVersion) as usize - ptr as usize },
        24usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(dbVersion)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pragmaSchemaVersion) as usize - ptr as usize },
        32usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pragmaSchemaVersion)
        )
    );
    assert_eq!(
        unsafe {
            ::core::ptr::addr_of!((*ptr).pragmaSchemaVersionForTableInfos) as usize - ptr as usize
        },
        36usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pragmaSchemaVersionForTableInfos)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).siteId) as usize - ptr as usize },
        40usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(siteId)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pDbVersionStmt) as usize - ptr as usize },
        48usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pDbVersionStmt)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).zpTableInfos) as usize - ptr as usize },
        56usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(zpTableInfos)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).tableInfosLen) as usize - ptr as usize },
        64usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(tableInfosLen)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).rowsImpacted) as usize - ptr as usize },
        68usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(rowsImpacted)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).seq) as usize - ptr as usize },
        72usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(seq)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pSetSyncBitStmt) as usize - ptr as usize },
        80usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pSetSyncBitStmt)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).pClearSyncBitStmt) as usize - ptr as usize },
        88usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(pClearSyncBitStmt)
        )
    );
    assert_eq!(
        unsafe { ::core::ptr::addr_of!((*ptr).hStmts) as usize - ptr as usize },
        96usize,
        concat!(
            "Offset of field: ",
            stringify!(crsql_ExtData),
            "::",
            stringify!(hStmts)
        )
    );
}
