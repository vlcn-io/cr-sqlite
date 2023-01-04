{
  'target_defaults': {
    'default_configuration': 'Release',
    'msvs_settings': {
      'VCCLCompilerTool': {
        'ExceptionHandling': 1,
      },
    },
    'conditions': [
      ['OS == "win"', {
        'defines': ['WIN32'],
      }],
    ],
    'configurations': {
      'Debug': {
        'defines!': [
          'NDEBUG',
        ],
        'defines': [
          'DEBUG',
          '_DEBUG',
          'SQLITE_DEBUG',
          'SQLITE_MEMDEBUG',
          'SQLITE_ENABLE_API_ARMOR',
          'SQLITE_WIN32_MALLOC_VALIDATE',
        ],
        'cflags': [
          '-O0 -g',
        ],
        'xcode_settings': {
          'MACOSX_DEPLOYMENT_TARGET': '10.7',
          'GCC_OPTIMIZATION_LEVEL': '0',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
        },
        'msvs_settings': {
          'VCLinkerTool': {
            'GenerateDebugInformation': 'true',
          },
        },
      },
      'Release': {
        'defines!': [
          'DEBUG',
          '_DEBUG',
        ],
        'defines': [
          'NDEBUG',
        ],
        'cflags': [
          '-O3',
        ],
        'xcode_settings': {
          'MACOSX_DEPLOYMENT_TARGET': '10.7',
          'GCC_OPTIMIZATION_LEVEL': '3',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'NO',
          'DEAD_CODE_STRIPPING': 'YES',
          'GCC_INLINES_ARE_PRIVATE_EXTERN': 'YES',
        },
      },
    },
  },
  'targets': [
    {
      'target_name': 'crsqlite',
      'sources': [
        './src/crsqlite.c',
        './src/util.c',
        './src/tableinfo.c',
        './src/triggers.c',
        './src/changes-vtab.c',
        './src/changes-vtab-read.c',
        './src/changes-vtab-common.c',
        './src/changes-vtab-write.c',
        './src/ext-data.c',
        './src/get-table.c',
        './src/seen-peers.c',
      ],
      'include_dirs': [
        './src',
        './src/sqlite',
      ],
      'cflags': ['-std=c99 -fPIC -shared'],
    },
  ],
}