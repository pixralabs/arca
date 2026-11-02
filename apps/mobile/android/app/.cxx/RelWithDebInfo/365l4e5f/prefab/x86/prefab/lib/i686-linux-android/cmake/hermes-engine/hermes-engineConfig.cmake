if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/radhe/.gradle/caches/8.10.2/transforms/61ace75894f79cc1db886fa7c8c31381/transformed/jetified-hermes-android-0.76.5-release/prefab/modules/libhermes/libs/android.x86/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/radhe/.gradle/caches/8.10.2/transforms/61ace75894f79cc1db886fa7c8c31381/transformed/jetified-hermes-android-0.76.5-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

