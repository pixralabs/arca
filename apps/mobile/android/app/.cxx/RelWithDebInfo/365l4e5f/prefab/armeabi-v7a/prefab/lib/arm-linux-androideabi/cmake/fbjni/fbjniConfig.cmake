if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "/home/radhe/.gradle/caches/8.10.2/transforms/45af7c1014cd86a46b7344726bffbeea/transformed/jetified-fbjni-0.6.0/prefab/modules/fbjni/libs/android.armeabi-v7a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/radhe/.gradle/caches/8.10.2/transforms/45af7c1014cd86a46b7344726bffbeea/transformed/jetified-fbjni-0.6.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

