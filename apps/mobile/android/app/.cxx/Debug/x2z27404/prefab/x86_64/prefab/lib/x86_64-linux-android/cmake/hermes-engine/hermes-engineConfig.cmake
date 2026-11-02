if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/home/radhe/.gradle/caches/8.10.2/transforms/574d332191422aa53a2bef15763441b7/transformed/jetified-hermes-android-0.76.5-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/radhe/.gradle/caches/8.10.2/transforms/574d332191422aa53a2bef15763441b7/transformed/jetified-hermes-android-0.76.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

