fn main() {
    // Never maintain a copied/parallel Lu Protobuf schema for socket transport.
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .expect("vendored protoc required for Lu canonical IPC");
    std::env::set_var("PROTOC", protoc);
    let proto = "../lu-core/proto/lu/v1/core.proto";
    prost_build::Config::new()
        .compile_protos(&[proto], &["../lu-core/proto"])
        .expect("compile canonical Lu Protobuf schema");
    println!("cargo:rerun-if-changed={proto}");
}
