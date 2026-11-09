if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/radhe/.gradle/caches/8.13/transforms/301e11e9ca6338f9ea766067bfcf9fe2/transformed/jetified-hermes-android-0.81.6-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/radhe/.gradle/caches/8.13/transforms/301e11e9ca6338f9ea766067bfcf9fe2/transformed/jetified-hermes-android-0.81.6-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

