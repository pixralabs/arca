if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/radhe/.gradle/caches/8.13/transforms/0b2305cd8038341b55cd78c970091bff/transformed/jetified-hermes-android-0.81.6-release/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/radhe/.gradle/caches/8.13/transforms/0b2305cd8038341b55cd78c970091bff/transformed/jetified-hermes-android-0.81.6-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

